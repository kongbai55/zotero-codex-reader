const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path').posix;
const {randomUUID}=require('node:crypto');
const {Session,promptFor}=require('../addon/content/core.js');
const win={TextDecoder};
function fixture({profileDir='/profile',pathAPI=path,maxPath=Infinity}={}){
  const files=new Map(),removed=[];
  const scope={Uint8Array,Services:{uuid:{generateUUID:randomUUID}},Zotero:{Profile:{dir:profileDir}},PathUtils:{join:pathAPI.join,parent:pathAPI.dirname,filename:pathAPI.basename},IOUtils:{
    makeDirectory:async()=>{},write:async(p,b)=>{if(p.length>=maxPath)throw new Error('NS_ERROR_FILE_NOT_FOUND');files.set(p,b);},remove:async p=>removed.push(p),stat:async()=>({type:'regular',size:3}),read:async()=>new Uint8Array([65,66,67])
  }};
  vm.createContext(scope);vm.runInContext(fs.readFileSync('addon/content/attachments.js','utf8'),scope);
  return {api:scope.CodexReaderAttachments,files,removed};
}
const file=(name,text)=>({name,size:Buffer.byteLength(text),arrayBuffer:async()=>new TextEncoder().encode(text).buffer});
test('long Windows PDF names use short copies while preserving names, bytes and distinct attachments',async()=>{
  const pathAPI=require('node:path').win32;
  const profileDir='C:\\Users\\ludin\\AppData\\Roaming\\Zotero\\Zotero\\Profiles\\03bu1ej5.default';
  const {api,files,removed}=fixture({profileDir,pathAPI,maxPath:260});
  const name='Tsujimura 等 - 2026 - Assessing the Belief Consistency of Large Language Models on the Logical Conversation Process.pdf';
  assert.equal(pathAPI.join(profileDir,'codex-reader-workspace','attachments',randomUUID(),name).length,261);
  const first=await api.import(file(name,'%PDF-fixture'),win);
  const second=await api.import(file(name,'%PDF-second'),win);
  assert.equal(first.name,name);assert.equal(second.name,name);
  assert.notEqual(first.path,second.path);assert.ok(first.path.length<=240);
  assert.equal(pathAPI.basename(first.path),'file.pdf');
  assert.equal(new TextDecoder().decode(files.get(first.path)),'%PDF-fixture');
  await api.discard(first);assert.deepEqual(removed,[pathAPI.dirname(first.path)]);
  const unicodeName='长标题😀'.repeat(60)+'.md';
  const text=await api.import(file(unicodeName,'完整内容'),win);
  assert.equal(text.name,unicodeName);assert.equal(text.text,'完整内容');
  assert.ok(text.path.endsWith('\\file.md'));
});

test('overlong profile paths fail clearly before writing a copy',async()=>{
  const {api,files,removed}=fixture({profileDir:'/profile/'+ 'x'.repeat(220),maxPath:260});
  await assert.rejects(api.import(file('paper.pdf','%PDF'),win),/附件保存路径过长/);
  assert.equal(files.size,0);assert.equal(removed.length,0);
});
test('imports independent copies, decodes text and never treats HTML or SVG as image previews',async()=>{
  const {api,files}=fixture();
  const a=await api.import(file('../unsafe.html','<script>alert(1)</script>'),win);
  assert.equal(a.name,'unsafe.html');assert.equal(a.text,'<script>alert(1)</script>');assert.equal(a.kind,'file');
  assert.ok(files.has(a.path));assert.ok(a.path.startsWith('/profile/codex-reader-workspace/attachments/'));
  const svg=await api.import(file('vector.svg','<svg onload="bad()"/>'),win);
  assert.equal(svg.kind,'file');assert.ok(svg.text.includes('onload'));
  const png=Uint8Array.from([137,80,78,71,13,10,26,10,0]);
  const image=await api.import({name:'image.txt',arrayBuffer:async()=>png.buffer},win);
  assert.equal(image.kind,'image');assert.equal(image.mime,'image/png');assert.equal(image.text,'');
});
test('limits count, sizes, inline text and blocks empty or directory inputs',async()=>{
  const {api}=fixture();
  await assert.rejects(api.import(file('x','x'),win,Array(10).fill({})),/10/);
  await assert.rejects(api.import({name:'x',size:api.MAX_FILE+1},win),/20 MB/);
  await assert.rejects(api.import(file('x','x'),win,[{size:api.MAX_TOTAL}]),/50 MB/);
  await assert.rejects(api.import(file('x',''),win),/空文件/);
  const text=await api.import(file('large.md','x'.repeat(61000)),win);
  assert.equal(text.text.length,60000);assert.equal(text.truncated,true);
  const rest=await api.import(file('next.txt','abc'),win,[text]);assert.equal(rest.text,'');assert.equal(rest.truncated,true);
});
test('discard only deletes a managed UUID directory, never original or forged paths',async()=>{
  const {api,removed}=fixture(),a=await api.import(file('note.txt','abc'),win);
  await api.discard(a);await api.discard({path:'/user/papers/paper.pdf'});await api.discard({path:'/profile/codex-reader-workspace/attachments/../../paper.pdf'});
  assert.deepEqual(removed,[path.dirname(a.path)]);
});
test('text paste stays native and File items are captured once',()=>{
  const {api}=fixture(),a=file('a.txt','abc');
  assert.equal(api.fromTransfer({types:['text/plain'],files:[]}).length,0);
  assert.equal(api.fromTransfer({files:[a],items:[{kind:'file',getAsFile:()=>a}]}).length,1);
  assert.equal(api.fromTransfer({files:[],items:[{kind:'file',getAsFile:()=>a}]}).length,1);
  assert.equal(api.hasFiles({types:['Files']}),true);assert.equal(api.hasFiles({types:['text/plain']}),false);
});
test('turn sends real localImage input and file text while failed sends retain source metadata',async()=>{
  const {api}=fixture(),image=await api.import({name:'screen.png',arrayBuffer:async()=>Uint8Array.from([137,80,78,71,13,10,26,10]).buffer},win);
  const text=await api.import(file('research.md','Untrusted file text'),win);
  const calls=[],session=new Session({request:async(method,params)=>{calls.push([method,params]);return method==='thread/start'?{thread:{id:'thread'}}:{turn:{status:'completed'}};}},'/project');
  await session.send({question:'Review attachments',attachments:[image,text]});
  const input=calls.find(([method])=>method==='turn/start')[1].input;
  assert.equal(input[1].type,'localImage');assert.equal(input[1].path,image.path);
  assert.match(input[0].text,/Untrusted file text/);assert.match(input[0].text,/BEGIN UNTRUSTED ATTACHMENTS/);
  assert.equal(session.messages[0].attachments[1].name,'research.md');
  assert.equal(session.messages[0].attachments[1].text,undefined);
  session.rpc.request=async()=>{throw new Error('offline');};
  await assert.rejects(session.send({question:'retry',attachments:[image]}),/offline/);
  assert.equal(session.messages[2].attachments[0].path,image.path);
  assert.throws(()=>promptFor({question:'x',attachments:[{...image,path:'https://example.invalid/image.png'}]}),/附件无效/);
});
test('history restores attachment names and paths without exposing embedded file text as the question',()=>{
  const scope={CodexReaderCore:require('../addon/content/core.js')};vm.createContext(scope);vm.runInContext(fs.readFileSync('addon/content/host.js','utf8'),scope);
  const a={name:'paper.pdf',path:'/profile/paper.pdf',kind:'file',size:100};
  const messages=scope.CodexReaderHost.displayMessages({turns:[{items:[{type:'userMessage',content:[{type:'text',text:promptFor({question:'Explain',attachments:[a]})}]}]}]});
  assert.equal(messages[0].text,'Explain');assert.equal(messages[0].attachments[0].name,'paper.pdf');
});
