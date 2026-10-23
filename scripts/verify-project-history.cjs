// Read-only diagnostic: counts project conversations/background; no model request.
const {spawn}=require('node:child_process'),fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm');
const Core=require('../addon/content/core.js');
const binary=process.argv[2],name=process.argv[3];
const home=process.env.CODEX_HOME || path.join(require('node:os').homedir(),'.codex');
(async()=>{
  const state=JSON.parse(await fs.readFile(path.join(home,'.codex-global-state.json'),'utf8'));
  const record=Object.values(state['local-projects'] || {}).find(p=>p.name===name && !p.id.startsWith('g-p-'));
  if(!record)throw new Error('Project not found');
  const maps=Object.values(state['app-server-project-id-by-legacy-project-id-by-host'] || {});
  const project={id:record.id,name:record.name,path:record.rootPaths[0],roots:record.rootPaths,backendId:maps.map(m=>m[record.id]).find(Boolean)};
  const child=spawn(binary,Core.launchArgs(),{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const rpc=new Core.Rpc({write:line=>new Promise((resolve,reject)=>child.stdin.write(line,e=>e?reject(e):resolve())),timer:{set:setTimeout,clear:clearTimeout}});
  child.stdout.setEncoding('utf8');child.stdout.on('data',data=>rpc.feed(data));child.stderr.resume();child.on('error',e=>rpc.close(e));child.on('exit',()=>rpc.close());
  try{
    await rpc.request('initialize',{clientInfo:{name:'zotero_codex_readonly_project_check',version:'0.5.0'},capabilities:{experimentalApi:true}});await rpc.notify('initialized');
    const scope={CodexReaderCore:Core,CodexReaderProjects:{current:()=>project,codexHome:async()=>home,pathKey:p=>p.replace(/\\/g,'/').toLowerCase()},PathUtils:path,IOUtils:{readUTF8:p=>fs.readFile(p,'utf8')},setTimeout,clearTimeout};
    vm.createContext(scope);vm.runInContext(await fs.readFile(path.resolve('addon/content/host.js'),'utf8'),scope);
    const host=scope.CodexReaderHost;host.rpc=rpc;host.cwd=project.path;
    const threads=await host.listHistory('paper'),background=await host.projectContext('paper',{});
    console.log(JSON.stringify({project:name,conversations:threads.length,backgroundCharacters:background.length,bounded:background.length<=16000}));
  }finally{rpc.close();child.kill();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
