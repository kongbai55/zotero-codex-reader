/* Local project folders and explicitly saved shared project guidance. */
var CodexReaderProjects = {
  pref:'extensions.codexreader.projects',
  listeners:new Set(),timer:null,running:false,syncing:null,status:'正在读取 Codex 项目…',
  load() {
    try {const data=JSON.parse(Services.prefs.getStringPref(this.pref,'{}'));return {projects:Array.isArray(data.projects)?data.projects:[],bindings:data.bindings || {}};}catch(_){return {projects:[],bindings:{}};}
  },
  save(data) {Services.prefs.setStringPref(this.pref,JSON.stringify(data));},
  identity(project) {return project.id || project.path;},
  pathKey(path) {return typeof Zotero!=='undefined' && Zotero.isWin ? path.replace(/\\/g,'/').replace(/\/$/,'').toLowerCase() : path.replace(/\/$/,'');},
  current(paperKey) {const data=this.load();return data.projects.find(p=>this.identity(p)===data.bindings[paperKey] || p.path===data.bindings[paperKey]) || null;},
  bind(paperKey,id) {const data=this.load();if(id && !data.projects.some(p=>this.identity(p)===id && !p.missing))throw new Error('项目不存在或已在 Codex 中移除。');if(id)data.bindings[paperKey]=id;else delete data.bindings[paperKey];this.save(data);},
  async codexHome() {
    const custom=Services.prefs.getStringPref('extensions.codexreader.home','').trim();
    if(custom){if(!PathUtils.isAbsolute(custom))throw new Error('Codex 配置目录必须是完整路径。');return custom;}
    const {Subprocess}=ChromeUtils.importESModule('resource://gre/modules/Subprocess.sys.mjs');
    const env=Subprocess.getEnvironment();
    if(env.CODEX_HOME && PathUtils.isAbsolute(env.CODEX_HOME))return env.CODEX_HOME;
    const home=env.USERPROFILE || env.HOME;if(!home)throw new Error('未找到用户目录，请在连接设置中指定 Codex 配置目录。');
    return PathUtils.join(home,'.codex');
  },
  snapshot(state) {
    if(!state || typeof state!=='object' || Array.isArray(state))throw new Error('Codex 项目数据格式不受支持。');
    let projects=[];
    const local=state['local-projects'];
    if(local && typeof local==='object' && !Array.isArray(local)){
      for(const [id,p] of Object.entries(local)){
        if(!p || p.retiredChatGptBacking || p.chatGptBackingRecoveryPending)continue;
        const roots=p.rootPaths;
        if(typeof p.name!=='string' || !Array.isArray(roots) || !roots.length || !roots.every(root=>typeof root==='string' && PathUtils.isAbsolute(root)))throw new Error('Codex 项目目录格式不受支持；已保留上次的项目列表。');
        projects.push({id:p.id || id,name:p.name,path:roots[0],roots:roots.slice(),source:'codex'});
      }
      // Older ChatGPT-backed aliases may coexist with their migrated local identities.
      const migrated=!!state['app-server-project-id-by-legacy-project-id-by-host'];
      projects=projects.filter(p=>!p.id.startsWith('g-p-') || !migrated && !projects.some(other=>!other.id.startsWith('g-p-') && this.pathKey(other.path)===this.pathKey(p.path)));
      const order=state['project-order'];if(Array.isArray(order))projects.sort((a,b)=>{const x=order.indexOf(a.id),y=order.indexOf(b.id);return (x<0?Infinity:x)-(y<0?Infinity:y);});
    } else if(Array.isArray(state['electron-saved-workspace-roots'])){
      const labels=state['electron-workspace-root-labels'] || {};
      projects=state['electron-saved-workspace-roots'].map(path=>{
        if(typeof path!=='string' || !PathUtils.isAbsolute(path))throw new Error('旧版 Codex 项目目录格式不受支持。');
        return {id:'codex-root:'+this.pathKey(path),name:labels[path] || PathUtils.filename(path),path,roots:[path],source:'codex'};
      });
    } else throw new Error('尚未找到 Codex 桌面项目列表，请打开 Codex 并创建项目，或检查配置目录。');
    return projects;
  },
  merge(projects) {
    const data=this.load(),bindings={...data.bindings};
    for(const [key,value] of Object.entries(bindings)){
      const previous=data.projects.find(p=>this.identity(p)===value || p.path===value);
      const matching=projects.find(p=>p.id===value) || (previous && !previous.id ? projects.find(p=>this.pathKey(p.path)===this.pathKey(previous.path)) : null);
      if(matching)bindings[key]=matching.id;
    }
    const local=data.projects.filter(p=>p.source!=='codex' && !projects.some(other=>this.pathKey(other.path)===this.pathKey(p.path)));
    const missing=data.projects.filter(p=>p.source==='codex' && Object.values(bindings).includes(this.identity(p)) && !projects.some(other=>other.id===p.id)).map(p=>({...p,missing:true}));
    const next={projects:[...projects,...local,...missing],bindings};
    if(JSON.stringify(data)!==JSON.stringify(next))this.save(next);
    return projects.length;
  },
  async sync() {
    if(this.syncing)return this.syncing;
    this.syncing=(async()=>{
      try {
        const home=await this.codexHome();
        // Read only the desktop's project registry; never read credentials or rewrite app state.
        const state=JSON.parse(await IOUtils.readUTF8(PathUtils.join(home,'.codex-global-state.json')));
        const count=this.merge(this.snapshot(state));this.status=`自动同步 · ${count} 个 Codex 项目`;
        return count;
      } catch(error) {this.status='同步未完成：'+error.message;throw error;}
      finally {for(const listener of this.listeners){try{listener();}catch(_){}}}
    })();
    try{return await this.syncing;}finally{this.syncing=null;}
  },
  start(listener) {
    this.listeners.add(listener);if(this.running)return;this.running=true;
    const poll=async()=>{await this.sync().catch(()=>{});if(this.running)this.timer=setTimeout(poll,5000);};poll();
  },
  stop(listener) {this.listeners.delete(listener);if(this.listeners.size)return;this.running=false;if(this.timer!==null)clearTimeout(this.timer);this.timer=null;},
  async choose(win,create=false) {
    const {FilePicker}=ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
    const picker=new FilePicker();picker.init(win,create?'选择新项目的父文件夹':'选择 Codex 使用的项目文件夹',picker.modeGetFolder);
    if(await picker.show()!==picker.returnOK)return null;
    let path=picker.file,name=PathUtils.filename(path);
    if(create){
      const value={value:''};if(!Services.prompt.prompt(win,'创建项目','项目名称',value,null,{}))return null;
      name=value.value.trim();if(!name || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || name.length>100)throw new Error('请输入有效的项目名称。');
      path=PathUtils.join(path,name);await IOUtils.makeDirectory(path,{ignoreExisting:false});
    }
    const data=this.load();if(!data.projects.some(p=>p.path===path)){data.projects.push({name,path});this.save(data);}
    return {name,path};
  },
  async readMemory(path) {
    const file=PathUtils.join(path,'AGENTS.md');return await IOUtils.exists(file)?IOUtils.readUTF8(file):'';
  },
  async saveMemory(path,text,expected) {
    if(text.length>24000)throw new Error('项目记忆请控制在 24,000 字符以内。');
    const current=await this.readMemory(path);if(current!==expected)throw new Error('项目记忆已在其他窗口修改，请重新载入后编辑。');
    await IOUtils.writeUTF8(PathUtils.join(path,'AGENTS.md'),text,{tmpPath:PathUtils.join(path,'AGENTS.md.codex-reader.tmp')});
  }
};
