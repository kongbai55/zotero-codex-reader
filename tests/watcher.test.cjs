const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawn}=require('node:child_process');
test('native watcher coalesces writes, ignores other files, survives atomic replacement and exits with parent input',async()=>{
  const scope={};vm.createContext(scope);vm.runInContext(fs.readFileSync(require.resolve('../addon/content/project-watcher.js'),'utf8'),scope);
  const root=path.resolve('test-results');fs.mkdirSync(root,{recursive:true});const directory=fs.mkdtempSync(path.join(root,'native-watch-'));
  const child=spawn(process.execPath,['-e','('+scope.CodexReaderProjectWatcher.worker.toString()+')();',directory],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let buffer='',changes=0;const messages=[];
  child.stdout.setEncoding('utf8');child.stdout.on('data',data=>{buffer+=data;let end;while((end=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);messages.push(m);if(m.type==='change')changes++;}});child.stderr.resume();
  const until=async fn=>{const deadline=Date.now()+5000;while(!fn()){if(Date.now()>deadline)throw new Error('watch timeout');await new Promise(resolve=>setTimeout(resolve,20));}};
  try{
    await until(()=>messages.some(m=>m.type==='ready'));fs.writeFileSync(path.join(directory,'unrelated.txt'),'x');await new Promise(resolve=>setTimeout(resolve,400));assert.equal(changes,0);
    const target=path.join(directory,'.codex-global-state.json');fs.writeFileSync(target,'{}');fs.writeFileSync(target,'{"new":true}');await until(()=>changes===1);
    fs.writeFileSync(path.join(directory,'replacement.json'),'{}');fs.renameSync(path.join(directory,'replacement.json'),target);await until(()=>changes===2);
    fs.writeFileSync(target,'{"again":true}');await until(()=>changes===3);
    const exited=new Promise(resolve=>child.once('exit',resolve));child.stdin.end();await exited;assert.equal(child.exitCode,0);
  }finally{child.kill();}
});
