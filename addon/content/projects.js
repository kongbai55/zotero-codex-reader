/* Local project folders and explicitly saved shared project guidance. */
var CodexReaderProjects = {
  pref:'extensions.codexreader.projects',
  load() {
    try {const data=JSON.parse(Services.prefs.getStringPref(this.pref,'{}'));return {projects:Array.isArray(data.projects)?data.projects:[],bindings:data.bindings || {}};}catch(_){return {projects:[],bindings:{}};}
  },
  save(data) {Services.prefs.setStringPref(this.pref,JSON.stringify(data));},
  current(paperKey) {const data=this.load();return data.projects.find(p=>p.path===data.bindings[paperKey]) || null;},
  bind(paperKey,path) {const data=this.load();if(path && !data.projects.some(p=>p.path===path))throw new Error('项目不存在。');if(path)data.bindings[paperKey]=path;else delete data.bindings[paperKey];this.save(data);},
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
