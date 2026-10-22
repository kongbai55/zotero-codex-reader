// Read-only integration probe: no model turn, no credential file access or sensitive output.
const {spawn} = require('node:child_process');
const {Rpc,launchArgs} = require('../addon/content/core.js');
const binary=process.argv[2];
if(!binary) throw new Error('Pass the absolute native Codex executable path.');
const child=spawn(binary,launchArgs(),{cwd:process.cwd(),windowsHide:true,stdio:['pipe','pipe','pipe']});
const rpc=new Rpc({write:line=>new Promise((resolve,reject)=>child.stdin.write(line,e=>e?reject(e):resolve())),timer:{set:setTimeout,clear:clearTimeout}});
child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>rpc.feed(chunk));child.stderr.resume();
child.on('error',e=>rpc.close(e));child.on('exit',()=>rpc.close());
(async()=>{
 try {
  const init=await rpc.request('initialize',{clientInfo:{name:'zotero_codex_reader',title:'Codex Reader for Zotero',version:'0.1.0'},capabilities:{experimentalApi:true}});
  await rpc.notify('initialized');
  const account=await rpc.request('account/read',{refreshToken:false});
  const history=await rpc.request('thread/list',{limit:1,sortKey:'updated_at'});
  const models=await rpc.request('model/list',{});
  console.log(JSON.stringify({handshake:true,userAgent:init.userAgent,accountAvailable:!!account.account,historyReadable:Array.isArray(history.data),modelCount:models.data?.length || 0}));
 } catch(e) {console.error(e.message);process.exitCode=1;}
 finally {rpc.close();child.kill();}
})();
