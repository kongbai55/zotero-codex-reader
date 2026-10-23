/* Native file notifications via the existing local Node runtime. No polling or network. */
var CodexReaderProjectWatcher = {
  async findNode(Subprocess) {
    const env=Subprocess.getEnvironment(),candidates=[];
    for(const key of ['CODEX_MCP_NODE_PATH','CODEX_BROWSER_USE_NODE_PATH'])if(env[key])candidates.push(env[key]);
    try {candidates.push(await Subprocess.pathSearch(Zotero.isWin?'node.exe':'node'));}catch(_){}
    if(env.USERPROFILE)candidates.push(PathUtils.join(env.USERPROFILE,'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','bin','node.exe'));
    if(env.LOCALAPPDATA){
      const root=PathUtils.join(env.LOCALAPPDATA,'OpenAI','Codex','runtimes','cua_node');
      try {for(const dir of await IOUtils.getChildren(root))candidates.push(PathUtils.join(dir,'bin','node.exe'));}catch(_){}
    }
    for(const path of candidates)if(PathUtils.isAbsolute(path) && await IOUtils.exists(path))return path;
    throw new Error('未找到本机 Node，暂用打开列表时刷新');
  },
  async start(directory,onChange,onError) {
    const {Subprocess}=ChromeUtils.importESModule('resource://gre/modules/Subprocess.sys.mjs');
    const binary=await this.findNode(Subprocess);
    const source='('+this.worker.toString()+')();';
    const process=await Subprocess.call({command:binary,arguments:['-e',source,directory],workdir:directory,stderr:'pipe'});
    const handle={stopped:false,stop(){if(this.stopped)return;this.stopped=true;try{process.kill();}catch(_){}}};
    let ready=false,resolveReady,rejectReady;
    const started=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
    const timeout=setTimeout(()=>{rejectReady(new Error('文件监听启动超时'));handle.stop();},10000);
    const fail=()=>{if(handle.stopped)return;handle.stop();if(!ready)rejectReady(new Error('文件监听未能启动'));else onError(new Error('文件监听已停止，打开列表时将重试'));};
    (async()=>{
      let buffer='';
      try {while(!handle.stopped){const chunk=await process.stdout.readString();if(!chunk)break;buffer+=chunk;if(buffer.length>8192)throw new Error('Invalid watcher output');
        let end;while((end=buffer.indexOf('\n'))>=0){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);
          if(message.type==='ready' && !ready){ready=true;clearTimeout(timeout);resolveReady(handle);}
          else if(message.type==='change' && ready)onChange();
          else if(message.type==='error')throw new Error('File watch failed');
        }
      }}catch(_){}finally{clearTimeout(timeout);fail();}
    })();
    (async()=>{try{while(await process.stderr.readString()){} }catch(_){}})();
    process.wait().then(fail,fail);
    try{return await started;}catch(error){clearTimeout(timeout);handle.stop();throw error;}
  },
  worker:function() {
    const fs=require('node:fs'),path=require('node:path');
    const directory=process.argv[1],target='.codex-global-state.json';let watcher,timer;
    const emit=type=>process.stdout.write(JSON.stringify({type})+'\n');
    const changed=()=>{clearTimeout(timer);timer=setTimeout(()=>emit('change'),250);};
    const close=()=>{clearTimeout(timer);watcher?.close();process.exit(0);};
    try {
      // Watch the directory so atomic file replacements continue to be observed.
      watcher=fs.watch(directory,{persistent:true,recursive:false},(_event,name)=>{
        if(name===null || path.basename(String(name)).toLowerCase()===target)changed();
      });
      watcher.on('error',()=>{emit('error');close();});emit('ready');
      process.stdin.resume();process.stdin.on('end',close);process.stdin.on('error',close);
      process.on('SIGTERM',close);process.on('SIGINT',close);
    }catch(_){emit('error');process.exitCode=1;}
  }
};
