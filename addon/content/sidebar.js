var CodexReaderUI = {
  views:new Map(), drafts:new Map(), selectionHandler:null, paneID:null, rootURI:'',
  h(doc,tag,props = {},text) {
    const node = doc.createElementNS('http://www.w3.org/1999/xhtml',tag);
    for (const [key,value] of Object.entries(props)) {
      if (key === 'className') node.className = value;
      else if (key in node) node[key] = value;
      else node.setAttribute(key,value);
    }
    if (text !== undefined) node.textContent = text;
    return node;
  },
  install(rootURI,pluginID) {
    this.rootURI = rootURI;
    this.projectListener=()=>{for(const view of this.views.values())this.update(view);};
    this.paneID = Zotero.ItemPaneManager.registerSection({
      paneID:'codex-reader',pluginID,
      header:{l10nID:'codex-reader-title',icon:rootURI+'content/icon.svg'},
      sidenav:{l10nID:'codex-reader-nav',icon:rootURI+'content/icon.svg'},
      onItemChange:({item,tabType,setEnabled})=>{setEnabled(tabType === 'reader' && !!item); return true;},
      onRender:props=>this.render(props),
      onDestroy:({body})=>this.destroyView(body)
    });
    if(typeof CodexReaderPanel!=='undefined')CodexReaderPanel.install();
    this.selectionHandler = event=>{
      const text = event.params.annotation?.text;
      if (!text) return;
      const popup=this.h(event.doc,'div',{className:'cr-selection-context'});
      const comment=this.h(event.doc,'textarea',{rows:2,placeholder:'添加可选评论…','aria-label':'选文评论'});
      const button = this.h(event.doc,'button',{type:'button'},'添加到对话');
      popup.append(comment,button);
      button.addEventListener('click',()=>{
        const key = String(event.reader.itemID || event.reader._item?.id);
        const page = event.params.annotation?.pageLabel;
        const state = this.drafts.get(key) || {question:'',context:'',annotations:[]};
        state.annotations ||= [];
        state.annotations.push({id:this.noteID(),source:'paper',page:page || '',text,comment:comment.value});
        this.drafts.set(key,state);
        if(typeof CodexReaderPanel==='undefined' || !event.reader._window || !CodexReaderPanel.open(event.reader._window))event.reader.setContextPaneOpen(true);
        for (const view of this.views.values()) if (view.key === key) {
          view.annotations=state.annotations.map(note=>({...note}));
          this.renderAnnotations(view);this.saveDraft(view);view.question.focus();
        }
        button.textContent = '已添加注释';button.disabled=true;
      });
      event.append(popup);
    };
    Zotero.Reader.registerEventListener('renderTextSelectionPopup',this.selectionHandler,pluginID);
    this.updateListener = ()=>{for (const view of this.views.values()) this.update(view);};
    CodexReaderHost.listeners.add(this.updateListener);
  },
  findReader(doc,item) {
    const win = doc.defaultView;
    const selectedID = win.Zotero_Tabs?.selectedID;
    const current = selectedID && Zotero.Reader.getByTabID(selectedID);
    if (current) return current;
    const readers = Zotero.Reader._readers || [];
    return readers.find(r=>r._window === win) || readers.find(r=>r.itemID === item?.id);
  },
  render({body,item,doc}) {
    if(typeof CodexReaderPanel!=='undefined')CodexReaderPanel.watchWindow(doc.defaultView);
    doc.defaultView.MozXULElement?.insertFTLIfNeeded('codex-reader.ftl');
    const reader = this.findReader(doc,item);
    const attachmentID = reader?.itemID || (item?.isAttachment?.() ? item.id : null);
    const key = String(attachmentID || item.id);
    let view = this.views.get(body);
    if (view && view.key === key) {this.update(view);return;}
    if (view) this.destroyView(body);
    const attachment = attachmentID && Zotero.Items.get(attachmentID);
    const paper = attachment?.parentID ? Zotero.Items.get(attachment.parentID) : item;
    const title = paper?.getField('title') || attachment?.getField('title') || '当前论文';
    const h = (tag,props,text)=>this.h(doc,tag,props,text);
    const root = h('section',{className:'cr-root','aria-label':'Codex 论文助手'});
    const style = h('link',{rel:'stylesheet',href:this.rootURI+'content/sidebar.css'});
    const mathStyle = h('link',{rel:'stylesheet',href:this.rootURI+'content/vendor/katex.min.css'});
    const paperHeading=h('div',{className:'cr-title',title},title);
    const status = h('div',{className:'cr-status',role:'status','aria-live':'polite'});
    const bar = h('div',{className:'cr-toolbar'});
    const connect = h('button',{type:'button'},'连接 Codex');
    const login = h('button',{type:'button'},'官方登录');
    const reset = h('button',{type:'button'},'新会话');
    const stop = h('button',{type:'button'},'停止');
    bar.append(connect,login);
    const details = h('details',{className:'cr-settings cr-panel'});
    details.append(h('summary',{},'连接设置'));
    const description = h('p',{},'直接使用现有 Codex 登录、配置和服务。插件不读取凭证文件、不增加中转。聊天与工具调用遵循 Codex 当前设置。');details.append(description);
    const path = h('input',{type:'text',placeholder:'自动寻找 Codex；也可填 codex.exe / codex.cmd 的完整路径',value:Services.prefs.getStringPref('extensions.codexreader.binary',''),'aria-label':'Codex 可执行文件路径'});
    details.append(path);
    const savePath = h('button',{type:'button'},'保存路径并重连');details.append(savePath);
    const homePath=h('input',{type:'text',value:Services.prefs.getStringPref('extensions.codexreader.home',''),placeholder:'留空自动寻找 CODEX_HOME / 用户目录下的 .codex','aria-label':'Codex 项目同步配置目录'});
    const saveHome=h('button',{type:'button'},'保存项目同步目录');details.append(h('p',{className:'cr-small'},'Codex 项目同步配置目录（仅用于读取桌面项目列表）'),homePath,saveHome);
    const model = h('select',{'aria-label':'模型'});
    const effort = h('select',{'aria-label':'推理强度',title:'推理强度'});
    const historyLoad = h('button',{type:'button'},'加载 Codex 对话');
    details.append(h('p',{className:'cr-small'},'App 的专属工具及进行中状态不保证同步。'));
    const quota = h('button',{type:'button'},'查看账户用量');const quotaInfo = h('div',{className:'cr-small'}); details.append(quota,quotaInfo);
    const projectDetails=h('details',{className:'cr-projects cr-panel'});projectDetails.append(h('summary',{},'项目与共享记忆'));
    const projectPath=h('div',{className:'cr-small'});
    const projectCreate=h('button',{type:'button'},'创建项目'),projectChoose=h('button',{type:'button'},'添加已有文件夹'),projectImport=h('button',{type:'button'},'立即同步 Codex 项目');
    const memory=h('textarea',{rows:9,'aria-label':'项目共享记忆',placeholder:'项目目标、术语、偏好和已确认结论…'});
    const memoryReload=h('button',{type:'button'},'重新载入记忆'),memorySave=h('button',{type:'button'},'保存共享记忆'),pathCopy=h('button',{type:'button'},'复制项目路径');
    const projectPush=h('button',{type:'button'},'同步到 Codex');
    const projectClose=h('button',{type:'button',className:'cr-panel-close'},'完成');
    projectDetails.append(projectPath,h('p',{className:'cr-small'},'项目文件变化时自动同步，打开列表或返回 Zotero 时也会检查。新建或添加项目会打开 Codex，由桌面端接收目录；若出现目录授权，请完成后返回，项目会自动关联。不会自动发送聊天。'),projectCreate,projectChoose,projectImport,projectPush,memory,memoryReload,memorySave,pathCopy,projectClose);
    memory.before(h('p',{className:'cr-small'},'以下是 AGENTS.md 项目指导。历史对话在会话列表中；新会话会带入最多 16,000 字符的近期本地项目背景。ChatGPT 云端聊天和账户长期记忆请在桌面端查看。'));
    const log = h('div',{className:'cr-log',role:'log','aria-label':'聊天记录'});
    const contextDetails = h('details',{className:'cr-context cr-panel'});contextDetails.append(h('summary',{},'注释与论文上下文'));
    const annotationList=h('div',{className:'cr-annotation-list'});
    const contextInfo = h('div',{className:'cr-small'},'在 PDF 或回答中选中文字，添加到对话；可附评论、编辑和单独移除，发送后清空待发注释。');
    const context = h('textarea',{rows:6,placeholder:'这里的内容会在你点击发送时交给 Codex。','aria-label':'论文上下文'});
    const contextBar = h('div',{className:'cr-toolbar'});
    const extract = h('button',{type:'button'},'提取前 20 页文本'); const clearContext = h('button',{type:'button'},'清空上下文');
    contextBar.append(extract,clearContext);contextDetails.append(contextInfo,annotationList,h('p',{className:'cr-small'},'也可以粘贴或提取论文文本：'),context,contextBar);
    const question = h('textarea',{rows:2,placeholder:'向 Codex 提问…','aria-label':'问题'});
    const prompts = h('div',{className:'cr-toolbar'});
    for (const [label,text] of [['总结','请根据提供的论文内容，总结研究问题、方法、主要发现和局限。请说明当前上下文没有覆盖的部分。'],['解释','请解释选文的含义、关键术语和推理过程，区分原文结论与你的补充解释。'],['翻译','请准确翻译提供的选文，保留公式和专业术语。']]) {
      const button = h('button',{type:'button'},label);button.addEventListener('click',()=>{question.value=text;this.saveDraft(view);question.focus();});prompts.append(button);
    }
    const send = h('button',{type:'button',className:'cr-send'},'发送');
    const copy = h('button',{type:'button'},'复制对话'); const note = h('button',{type:'button'},'存为笔记');
    const error = h('div',{className:'cr-error',role:'alert'});
    // Keep the reader, history and composer in separate scrolling regions.
    const shell=h('div',{className:'cr-shell'});
    const nav=h('nav',{className:'cr-nav',hidden:true,'aria-label':'会话列表'});
    const main=h('div',{className:'cr-main'});
    const header=h('header',{className:'cr-header'});
    const toggle=h('button',{type:'button',className:'cr-icon','aria-label':'展开会话列表','aria-expanded':'false',title:'会话列表'},'☰');
    const brand=h('strong',{className:'cr-brand'},'Codex');
    const settingsToggle=h('button',{type:'button',className:'cr-icon','aria-label':'连接设置','aria-expanded':'false',title:'连接设置'},'⋯');
    const exitPanel=h('button',{type:'button',className:'cr-icon cr-exit','aria-label':'返回文献信息',title:'返回文献信息'},'×');
    reset.className='cr-new'; reset.title='为当前论文开始新会话'; reset.textContent='＋ 新会话';
    header.append(toggle,brand,reset,settingsToggle,exitPanel);
    const heading=h('div',{className:'cr-heading'});heading.append(paperHeading,status);
    const welcome=h('div',{className:'cr-welcome'});
    const mark=h('div',{className:'cr-welcome-mark','aria-hidden':'true'});
    const markSVG=doc.createElementNS('http://www.w3.org/2000/svg','svg');
    for(const [name,value] of Object.entries({width:'36',height:'36',viewBox:'0 0 36 36',fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round'}))markSVG.setAttribute(name,value);
    const markPath=doc.createElementNS('http://www.w3.org/2000/svg','path');markPath.setAttribute('d','M8 9l8 8-8 8M21 26h9');markSVG.append(markPath);mark.append(markSVG);
    welcome.append(mark,h('h2',{},'一起读懂这篇论文'),h('p',{},'选中一段文字来讨论，或直接向 Codex 提问。'),prompts);
    const conversation=h('div',{className:'cr-conversation'});conversation.append(welcome,log);
    const composer=h('div',{className:'cr-composer'});
    const contextToggle=h('button',{type:'button',className:'cr-context-toggle','aria-expanded':'false',title:'查看注释或添加论文文本'},'＋ 添加上下文');
    const annotationPreview=h('div',{className:'cr-annotation-preview',hidden:true});
    const composerBar=h('div',{className:'cr-composer-bar'});
    send.className='cr-send';send.title='发送（Enter）';send.setAttribute('aria-label','发送');
    stop.className='cr-stop';stop.title='停止生成';
    composerBar.append(contextToggle,model,effort,send,stop);composer.append(annotationPreview,question,composerBar);
    const bottom=h('div',{className:'cr-bottom'});
    bottom.append(error,composer,h('div',{className:'cr-footnote'},'Enter 发送 · Shift+Enter 换行'));
    const navHeading=h('div',{className:'cr-nav-heading'});
    const projectSelect=h('select',{'aria-label':'当前论文所属项目'}),projectManage=h('button',{type:'button',className:'cr-project-manage'},'项目与记忆…');
    const projectSyncInfo=h('div',{className:'cr-small cr-project-sync',role:'status','aria-live':'polite'});
    const navClose=h('button',{type:'button',className:'cr-icon','aria-label':'收起会话列表'},'×');
    navHeading.append(h('strong',{},'会话'),navClose);
    const current=h('button',{type:'button',className:'cr-current',title},'当前论文 · '+title);
    const deleteCurrent=h('button',{type:'button',className:'cr-delete-current'},'删除当前会话');
    const historyList=h('div',{className:'cr-history-list'});
    historyList.append(h('p',{className:'cr-small'},'点击加载，查看最近的 Codex 对话。'));
    historyLoad.className='cr-history-load';
    nav.append(navHeading,projectSelect,projectSyncInfo,projectManage,current,deleteCurrent,historyLoad,historyList,h('p',{className:'cr-small'},'选择项目后显示该项目的本地 Codex 对话；点击继续原会话。新会话会附上近期项目对话背景。'));
    const settingsClose=h('button',{type:'button',className:'cr-panel-close','aria-label':'关闭连接设置'},'关闭');
    details.append(bar,copy,note,settingsClose);
    const contextClose=h('button',{type:'button',className:'cr-panel-close','aria-label':'关闭上下文预览'},'完成');
    contextDetails.append(contextClose);
    for(const panel of [details,contextDetails,projectDetails])panel.append(h('div',{className:'cr-panel-error cr-error',role:'alert'}));
    main.append(header,heading,conversation,bottom,details,contextDetails,projectDetails);
    shell.append(nav,main);root.append(style,mathStyle,shell);body.replaceChildren(root);
    view = {body,root,key,reader,attachmentID,paper,title,status,connect,login,reset,stop,log,context,contextInfo,question,send,error,model,effort,lastModelJSON:'',contextDetails,welcome,contextToggle,nav,toggle,annotationList,annotationPreview,annotations:[],deleteCurrent,projectSelect,projectPath,projectDetails,memory,memoryReload,memorySave,pathCopy,projectClose,projectSyncInfo,projectPush};
    exitPanel.addEventListener('click',()=>{if(view.overlay)CodexReaderPanel.close(view.overlay);});
    const setNav=open=>{nav.hidden=!open;root.classList.toggle('cr-nav-open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'收起会话列表':'展开会话列表');if(open){CodexReaderProjects.sync().catch(()=>{});if(CodexReaderProjects.current(key))view.loadHistory?.().catch(e=>{error.textContent=e.message;});}};
    toggle.addEventListener('click',()=>setNav(nav.hidden));
    navClose.addEventListener('click',()=>{setNav(false);toggle.focus();});
    current.addEventListener('click',()=>{setNav(false);question.focus();});
    const setPanel=(panel,open)=>{details.open=false;contextDetails.open=false;projectDetails.open=false;panel.open=open;};
    settingsToggle.addEventListener('click',()=>setPanel(details,!details.open));
    contextToggle.addEventListener('click',()=>setPanel(contextDetails,!contextDetails.open));
    settingsClose.addEventListener('click',()=>{details.open=false;settingsToggle.focus();});
    contextClose.addEventListener('click',()=>{contextDetails.open=false;question.focus();});
    details.addEventListener('toggle',()=>settingsToggle.setAttribute('aria-expanded',String(details.open)));
    contextDetails.addEventListener('toggle',()=>contextToggle.setAttribute('aria-expanded',String(contextDetails.open)));
    root.addEventListener('keydown',event=>{if(event.key==='Escape'){if(projectDetails.open){projectDetails.open=false;projectManage.focus();}else if(contextDetails.open){contextDetails.open=false;contextToggle.focus();}else if(details.open){details.open=false;settingsToggle.focus();}else {setNav(false);toggle.focus();}event.stopPropagation();}});
    this.views.set(body,view);
    if(this.projectListener)CodexReaderProjects.start(this.projectListener);
    const draft = this.drafts.get(key); if (draft) {question.value=draft.question;context.value=draft.context;view.annotations=(draft.annotations || []).map(note=>({...note}));view.preferredModel=draft.model;view.preferredEffort=draft.effort;}
    this.renderAnnotations(view);this.saveDraft(view);
    model.addEventListener('change',()=>{view.lastEffortJSON='';this.updateEffort(view,true);this.saveDraft(view);});
    effort.addEventListener('change',()=>this.saveDraft(view));
    question.addEventListener('input',()=>this.saveDraft(view));context.addEventListener('input',()=>this.saveDraft(view));
    const action = fn=>async()=>{error.textContent='';for(const panel of [details,contextDetails,projectDetails])panel.querySelector('.cr-panel-error').textContent='';try{await fn();}catch(e){error.textContent=e.message;for(const panel of [details,contextDetails,projectDetails])panel.querySelector('.cr-panel-error').textContent=e.message;}this.update(view);};
    const reloadMemory=async()=>{
      const project=CodexReaderProjects.current(key),original=project?await CodexReaderProjects.readMemory(project.path):'';
      if(CodexReaderProjects.current(key)?.path!==project?.path)return;
      view.memoryPath=project?.path;view.memoryOriginal=original;
      memory.value=view.memoryOriginal;memory.disabled=!project || !!project.missing;memory.readOnly=!!project?.contextMirror;memorySave.disabled=memory.disabled || memory.readOnly;memoryReload.disabled=memory.disabled;pathCopy.disabled=!project;
    };
    const bindProject=async path=>{
      if(view.submitting || CodexReaderHost.sessions.get(key)?.busy)throw new Error('请先停止回答，再切换项目。');
      await CodexReaderHost.clearSession(key);CodexReaderProjects.bind(key,path);this.updateProjects(view);await reloadMemory();await view.loadHistory?.();
    };
    projectSelect.addEventListener('change',action(async()=>{try{await bindProject(projectSelect.value);}finally{this.updateProjects(view);}}));
    projectManage.addEventListener('click',action(async()=>{setNav(false);setPanel(projectDetails,true);await CodexReaderProjects.sync().catch(()=>{});await reloadMemory();}));
    projectClose.addEventListener('click',()=>{projectDetails.open=false;question.focus();});
    projectCreate.addEventListener('click',action(async()=>{const p=await CodexReaderProjects.choose(doc.defaultView,true);if(p)await bindProject(CodexReaderProjects.identity(p));}));
    projectChoose.addEventListener('click',action(async()=>{const p=await CodexReaderProjects.choose(doc.defaultView);if(p)await bindProject(CodexReaderProjects.identity(p));}));
    projectPush.addEventListener('click',action(async()=>{await CodexReaderProjects.sendToCodex(CodexReaderProjects.current(key));}));
    view.onWindowFocus=()=>CodexReaderProjects.sync().catch(()=>{});doc.defaultView.addEventListener('focus',view.onWindowFocus);
    projectImport.addEventListener('click',action(async()=>{
      await CodexReaderProjects.sync();this.updateProjects(view);
    }));
    saveHome.addEventListener('click',action(async()=>{
      const path=homePath.value.trim();if(path && !PathUtils.isAbsolute(path))throw new Error('请输入完整目录路径。');
      Services.prefs.setStringPref('extensions.codexreader.home',path);await CodexReaderProjects.sync();
    }));
    memoryReload.addEventListener('click',action(reloadMemory));
    memorySave.addEventListener('click',action(async()=>{
      const project=CodexReaderProjects.current(key);if(!project || project.missing || project.path!==view.memoryPath)throw new Error('请先选择可用项目并重新载入记忆。');
      if(project.contextMirror)throw new Error('这是由 Codex/ChatGPT 管理的只读项目说明，请在 Codex 中编辑项目指令。');
      const affected=[...CodexReaderHost.sessions].filter(([,s])=>s.cwd===project.path);
      if(affected.some(([,s])=>s.busy) || [...this.views.values()].some(v=>v.submitting && CodexReaderProjects.current(v.key)?.path===project.path))throw new Error('请先停止此项目中正在生成的回答。');
      await CodexReaderProjects.saveMemory(project.path,memory.value,view.memoryOriginal);view.memoryOriginal=memory.value;
      for(const [sessionKey] of affected)await CodexReaderHost.clearSession(sessionKey);
      projectPath.textContent='共享记忆已保存。新会话会读取更新；Codex 中也请新建会话以载入。';
    }));
    pathCopy.addEventListener('click',action(()=>{const project=CodexReaderProjects.current(key);if(project)Zotero.Utilities.Internal.copyTextToClipboard(project.path);}));
    connect.addEventListener('click',action(async()=>{
      if (CodexReaderHost.rpc && !CodexReaderHost.rpc.closed) {
        if ([...CodexReaderHost.sessions.values()].some(s=>s.busy)) throw new Error('有回答正在生成，请先停止再重连。');
        await CodexReaderHost.disconnect();
      }
      await CodexReaderHost.connect();
    }));
    login.addEventListener('click',action(()=>CodexReaderHost.login()));
    reset.addEventListener('click',action(()=>CodexReaderHost.clearSession(key)));
    deleteCurrent.addEventListener('click',action(async()=>{
      if(view.submitting || CodexReaderHost.sessions.get(key)?.busy)throw new Error('请先停止当前回答。');
      if(!Services.prompt.confirm(doc.defaultView,'删除当前会话','永久删除当前会话及其子会话？此操作不可撤销。'))return;
      const session=CodexReaderHost.sessions.get(key);
      if(session?.threadId)await CodexReaderHost.deleteHistory(session.threadId);
      else await CodexReaderHost.clearSession(key);
      question.value='';context.value='';view.annotations=[];this.renderAnnotations(view);this.saveDraft(view);
    }));
    stop.addEventListener('click',action(async()=>{
      const session=CodexReaderHost.sessions.get(key);
      try {await session?.interrupt();} catch (_) {await CodexReaderHost.disconnect();}
    }));
    savePath.addEventListener('click',action(async()=>{
      if ([...CodexReaderHost.sessions.values()].some(s=>s.busy)) throw new Error('请先停止正在生成的回答。');
      Services.prefs.setStringPref('extensions.codexreader.binary',path.value.trim());
      await CodexReaderHost.disconnect();await CodexReaderHost.connect();
    }));
    const loadHistory=async()=>{
      const token=view.historyToken=(view.historyToken || 0)+1;
      historyLoad.disabled=true;
      try {
        const threads=await CodexReaderHost.listHistory(key);if(token!==view.historyToken || !root.isConnected)return;
        historyList.replaceChildren();
        if (!threads.length) historyList.append(h('p',{className:'cr-small'},'此项目暂无本地 Codex 对话。ChatGPT 云端聊天请在 Codex 中打开项目查看。'));
        for (const thread of threads) {
          let label=thread.name || thread.preview || thread.id;
          if(label.startsWith('User question:\n'))label=label.slice('User question:\n'.length).split('\nPaper title (untrusted metadata):')[0].trim();
          label=label.slice(0,100);
          const entry=h('button',{type:'button',className:'cr-history-entry',title:'继续原会话：'+label},label);
          entry.addEventListener('click',action(async()=>{
            if(view.submitting || CodexReaderHost.sessions.get(key)?.busy)throw new Error('请先停止正在生成的回答。');
            entry.disabled=true;
            try {await CodexReaderHost.resumeHistory(key,thread.id);setNav(false);question.focus();}
            finally {entry.disabled=false;}
          }));
          const row=h('div',{className:'cr-history-row'});
          const remove=h('button',{type:'button',className:'cr-history-delete',title:'删除会话','aria-label':'删除会话：'+label},'×');
          remove.addEventListener('click',action(async()=>{
            if(!Services.prompt.confirm(doc.defaultView,'删除会话',`永久删除“${label}”及其子会话？此操作不可撤销。`))return;
            remove.disabled=true;entry.disabled=true;
            try {await CodexReaderHost.deleteHistory(thread.id);row.remove();}
            finally {remove.disabled=false;entry.disabled=false;}
          }));row.append(entry,remove);historyList.append(row);
        }
      } finally {if(token===view.historyToken)historyLoad.disabled=false;}
    };view.loadHistory=loadHistory;historyLoad.addEventListener('click',action(loadHistory));
    quota.addEventListener('click',action(async()=>{
      const rpc=await CodexReaderHost.connect();const result=await rpc.request('account/rateLimits/read',{});
      const limits=result.rateLimits;
      if (!limits) {quotaInfo.textContent='该账户未返回可用的限额信息。';return;}
      quotaInfo.textContent=[limits.primary,limits.secondary].filter(Boolean).map(x=>`${x.windowDurationMins || '?'} 分钟窗口：已用 ${x.usedPercent}%${x.resetsAt ? '，重置 '+new Date(x.resetsAt*1000).toLocaleString() : ''}`).join('\n') || '未返回可用的窗口信息。';
    }));
    extract.addEventListener('click',action(async()=>{
      if (!attachmentID || attachment?.attachmentContentType !== 'application/pdf') throw new Error('仅支持当前 PDF，其他格式请复制选文到上下文框。');
      extract.disabled=true; contextInfo.textContent='正在本地提取文本…';
      try {
        const result=await Zotero.PDFWorker.getFullText(attachmentID,20);
        if (!result.text?.trim()) throw new Error('未提取到文字；扫描件可能需要先做 OCR。');
        const truncated=result.text.length>CodexReaderCore.MAX_CONTEXT;
        context.value=`[来源：当前 PDF；提取前 ${result.extractedPages || 20} 页，共 ${result.totalPages || '?'} 页${truncated ? '；文本已截断' : ''}]\n`+result.text;
        context.value=context.value.slice(0,CodexReaderCore.MAX_CONTEXT);
        contextInfo.textContent=`已在本地提取 ${context.value.length} 字符${truncated ? '（已截断）' : ''}；预览后点击发送。`;
        setPanel(contextDetails,true);this.saveDraft(view);
      } finally {extract.disabled=false;}
    }));
    clearContext.addEventListener('click',()=>{context.value='';view.annotations=[];this.renderAnnotations(view);contextInfo.textContent='待发上下文已清空；会话仍记得之前发送的内容。';this.saveDraft(view);});
    const submit = action(async()=>{
      if(view.submitting || CodexReaderHost.sessions.get(key)?.busy)return;
      const rawQuestion=question.value;
      const input={question:rawQuestion.trim() || (view.annotations.length?'请根据以下注释逐条回应。':''),title,context:context.value,annotations:view.annotations.map(note=>({...note}))};CodexReaderCore.promptFor(input);
      view.submitting=true;this.update(view);
      try {
        await CodexReaderHost.connect();
        if (!CodexReaderHost.accountReady) throw new Error('请先在 Codex CLI 或此处完成官方登录。');
        const session=CodexReaderHost.getSession(key);
        input.projectContext=await CodexReaderHost.projectContext(key,session);
        await session.send(input,model.value,effort.value);
        session.projectContextLoaded=true;
        if(question.value===rawQuestion)question.value='';if(context.value===input.context)context.value='';
        const sentIDs=new Set(input.annotations.map(note=>note.id));view.annotations=view.annotations.filter(note=>!sentIDs.has(note.id));this.renderAnnotations(view);this.saveDraft(view);
      } finally {view.submitting=false;}
    });
    send.addEventListener('click',submit);
    let composing=false;
    question.addEventListener('compositionstart',()=>{composing=true;});question.addEventListener('compositionend',()=>{composing=false;});
    question.addEventListener('keydown',event=>{if(event.key==='Enter' && !event.shiftKey && !event.isComposing && !composing && event.keyCode!==229){event.preventDefault();submit();}});
    this.installResponseSelection(view);
    copy.addEventListener('click',action(()=>{
      const text=this.transcript(key,title);Zotero.Utilities.Internal.copyTextToClipboard(text);
      status.textContent='已复制对话。';
    }));
    note.addEventListener('click',action(async()=>{
      const text=this.transcript(key,title);
      const escape=value=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      const newNote=new Zotero.Item('note');newNote.libraryID=paper.libraryID;
      if (!paper.isAttachment()) newNote.parentID=paper.id;
      newNote.setNote(`<h2>Codex 阅读对话</h2><pre>${escape(text)}</pre>`);await newNote.saveTx();
      error.textContent='已保存为 Zotero 笔记；若启用 Zotero 同步，该笔记会按同步设置上传。';
    }));
    this.update(view);
  },
  noteID() {return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);},
  updateProjects(view) {
    const data=CodexReaderProjects.load(),path=data.bindings[view.key] || '',signature=JSON.stringify(data.projects);
    if(view.lastProjects!==signature){view.lastProjects=signature;view.projectSelect.replaceChildren(this.h(view.body.ownerDocument,'option',{value:''},'独立论文 · 选择项目'));
      for(const p of data.projects){
        if((p.source==='legacy' || p.missing) && CodexReaderProjects.identity(p)!==path)continue;
        view.projectSelect.append(this.h(view.body.ownerDocument,'option',{value:CodexReaderProjects.identity(p),title:(p.roots || [p.path]).join('\n'),disabled:!!p.missing},p.name+(p.source==='legacy'?'（旧目录，非 Codex 项目）':p.missing?'（已在 Codex 移除）':p.registration==='pending'?'（等待 Codex 接收）':'')));
      }
    }
    view.projectSelect.value=path;const project=CodexReaderProjects.current(view.key),projectSignature=JSON.stringify(project);
    view.projectSyncInfo.textContent=CodexReaderProjects.status;
    const historyButton=view.nav.querySelector('.cr-history-load');if(historyButton)historyButton.textContent=project?`刷新 ${project.name} 的对话`:'加载 Codex 对话';
    view.projectPush.disabled=!project || !!project.missing;view.projectPush.textContent=project?.source==='codex'?'在 Codex 中打开':'同步到 Codex';
    if(view.lastProjectPath!==projectSignature){view.lastProjectPath=projectSignature;view.projectPath.textContent=project?`${project.name}${project.missing?'（已移除，请重新选择）':''}\n${project.path}${project.contextMirror?'\n项目指导由 Codex/ChatGPT 管理，只读。':''}`:'尚未选择项目。';}
  },
  renderAnnotations(view) {
    const doc=view.body.ownerDocument,h=(tag,props,text)=>this.h(doc,tag,props,text);
    view.annotationList.replaceChildren();view.annotationPreview.replaceChildren();
    view.annotationPreview.hidden=!view.annotations.length;
    view.annotations.forEach((note,index)=>{
      const card=h('section',{className:'cr-annotation-card','data-note-id':note.id});
      const header=h('div',{className:'cr-annotation-header'});
      const source=`${index+1} · ${note.source==='response'?'对话选文':'论文选文'}${note.page?' · 第 '+note.page+' 页':''}`;
      const remove=h('button',{type:'button','aria-label':'移除注释 '+(index+1),title:'移除这条注释'},'×');
      remove.addEventListener('click',()=>{view.annotations=view.annotations.filter(x=>x.id!==note.id);this.renderAnnotations(view);this.saveDraft(view);view.lastMessages=null;this.update(view);});
      header.append(h('strong',{},source),remove);
      const quote=h('textarea',{rows:3,value:note.text,'aria-label':'注释 '+(index+1)+' 的选文'});
      const comment=h('textarea',{rows:2,value:note.comment || '',placeholder:'添加可选评论…','aria-label':'注释 '+(index+1)+' 的评论'});
      quote.addEventListener('input',()=>{note.text=quote.value;chip.textContent=`${index+1} ${note.text.slice(0,26)}${note.text.length>26?'…':''}`;this.saveDraft(view);this.update(view);});
      comment.addEventListener('input',()=>{note.comment=comment.value;chip.title=comment.value || note.text;this.saveDraft(view);this.update(view);});
      card.append(header,quote,comment);view.annotationList.append(card);
      const chip=h('button',{type:'button',className:'cr-annotation-chip',title:note.comment || note.text},`${index+1} ${note.text.slice(0,26)}${note.text.length>26?'…':''}`);
      chip.addEventListener('click',()=>{view.contextDetails.open=true;comment.focus();card.scrollIntoView({block:'nearest'});});view.annotationPreview.append(chip);
    });
  },
  updateEffort(view,modelChanged=false) {
    const selected=CodexReaderHost.models.find(m=>(m.model || m.id)===view.model.value);
    const options=selected?.supportedReasoningEfforts || [];
    const signature=JSON.stringify([view.model.value,options,selected?.defaultReasoningEffort]);
    if(view.lastEffortJSON===signature)return;
    view.lastEffortJSON=signature;
    const previous=modelChanged?'':(view.preferredEffort ?? view.effort.value);if(selected || modelChanged)view.preferredEffort=undefined;
    const labels={none:'无',minimal:'最低',low:'低',medium:'中',high:'高',xhigh:'特高',max:'最高',ultra:'Ultra'};
    view.effort.replaceChildren();
    if(!options.length)view.effort.append(this.h(view.body.ownerDocument,'option',{value:''},selected?'默认强度':'先选模型'));
    for(const item of options)view.effort.append(this.h(view.body.ownerDocument,'option',{value:item.reasoningEffort,title:item.description},labels[item.reasoningEffort] || item.reasoningEffort));
    view.effort.value=options.some(o=>o.reasoningEffort===previous)?previous:(selected?.defaultReasoningEffort || options[0]?.reasoningEffort || '');
    view.effort.disabled=!options.length || !!view.submitting || !!CodexReaderHost.sessions.get(view.key)?.busy;
  },
  installResponseSelection(view) {
    const doc=view.body.ownerDocument;
    const popup=this.h(doc,'button',{type:'button',className:'cr-selection-add',hidden:true},'添加到对话');view.root.querySelector('.cr-main').append(popup);
    let pending;
    view.log.addEventListener('mouseup',()=>{
      const selection=doc.defaultView.getSelection();popup.hidden=true;pending=null;
      if(!selection?.rangeCount || selection.isCollapsed || view.submitting)return;
      const range=selection.getRangeAt(0),start=range.startContainer.parentElement?.closest('.cr-assistant .cr-text');
      if(!start || !start.contains(range.endContainer))return;
      const raw=selection.toString(),text=raw.trim();if(!text || text.length>CodexReaderCore.MAX_CONTEXT)return;
      const prefix=range.cloneRange();prefix.selectNodeContents(start);prefix.setEnd(range.startContainer,range.startOffset);
      const fragment=prefix.cloneContents();for(const node of fragment.querySelectorAll('.cr-annotation-pin,.cr-code-bar'))node.remove();
      pending={source:'response',text,comment:'',messageIndex:Number(start.closest('.cr-message').dataset.messageIndex),start:fragment.textContent.length+raw.indexOf(text)};
      const r=range.getBoundingClientRect(),base=view.root.querySelector('.cr-main').getBoundingClientRect();
      popup.style.left=Math.max(8,Math.min(base.width-130,r.left-base.left))+'px';popup.style.top=Math.max(60,r.top-base.top-38)+'px';popup.hidden=false;
    });
    popup.addEventListener('mousedown',event=>event.preventDefault());
    popup.addEventListener('click',()=>{
      if(!pending)return;const note={id:this.noteID(),...pending};view.annotations.push(note);popup.hidden=true;pending=null;
      this.renderAnnotations(view);this.saveDraft(view);view.lastMessages=null;this.update(view);
      this.openNoteEditor(view,note,view.log.querySelector('.cr-annotation-pin:last-of-type'));
    });
    view.log.addEventListener('scroll',()=>{popup.hidden=true;});
  },
  openNoteEditor(view,note,anchor) {
    const doc=view.body.ownerDocument,main=view.root.querySelector('.cr-main');main.querySelector('.cr-note-popover')?.remove();
    const box=this.h(doc,'div',{className:'cr-note-popover',role:'dialog','aria-label':'选文注释'});
    const editable=view.annotations.some(n=>n.id===note.id);
    const comment=this.h(doc,'textarea',{rows:2,value:note.comment || '',placeholder:'添加可选评论…','aria-label':'注释评论',readOnly:!editable});
    const controls=this.h(doc,'div',{className:'cr-note-controls'});
    const close=this.h(doc,'button',{type:'button'},editable?'取消':'关闭');close.addEventListener('click',()=>box.remove());controls.append(close);
    if(editable){
      const remove=this.h(doc,'button',{type:'button','aria-label':'删除这条注释'},'删除');
      remove.addEventListener('click',()=>{view.annotations=view.annotations.filter(n=>n.id!==note.id);box.remove();this.renderAnnotations(view);this.saveDraft(view);this.update(view);});
      const save=this.h(doc,'button',{type:'button',className:'cr-note-save'},'保存');save.addEventListener('click',()=>{note.comment=comment.value;box.remove();this.renderAnnotations(view);this.saveDraft(view);this.update(view);});controls.prepend(remove);controls.append(save);
    }
    box.append(comment,controls);main.append(box);
    const base=main.getBoundingClientRect(),r=anchor?.getBoundingClientRect();
    box.style.left=Math.max(8,Math.min(base.width-300,(r?.left || base.left+20)-base.left))+'px';
    box.style.top=Math.max(60,Math.min(base.height-170,(r?.top || base.top+100)-base.top-145))+'px';
    box.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();box.remove();}});comment.focus();
  },
  markAnnotations(view,node,messageIndex,messages) {
    const all=[...messages.flatMap(m=>m.annotations || []),...view.annotations];
    all.forEach((note,index)=>{
      if(note.source!=='response' || note.messageIndex!==messageIndex || !note.text)return;
      const walker=node.ownerDocument.createTreeWalker(node,4),texts=[];let n,offset=0;
      while((n=walker.nextNode()))if(!n.parentElement.closest('.cr-annotation-pin,.cr-code-bar')){texts.push({node:n,start:offset,end:offset+n.length});offset+=n.length;}
      const plain=texts.map(t=>t.node.data).join('');
      const start=plain.slice(note.start,note.start+note.text.length)===note.text?note.start:plain.indexOf(note.text);
      if(start<0)return;
      let last;
      for(const part of texts){const from=Math.max(0,start-part.start),to=Math.min(part.node.length,start+note.text.length-part.start);if(from>=to)continue;
        const range=node.ownerDocument.createRange();range.setStart(part.node,from);range.setEnd(part.node,to);
        const mark=this.h(node.ownerDocument,'mark',{className:'cr-annotation-mark',title:note.comment || '选文注释'});range.surroundContents(mark);last=mark;
      }
      if(last){const pin=this.h(node.ownerDocument,'button',{type:'button',className:'cr-annotation-pin',title:note.comment || note.text,'aria-label':'注释 '+(index+1)},String(index+1));
        pin.addEventListener('click',()=>this.openNoteEditor(view,note,pin));last.after(pin);}
    });
  },
  saveDraft(view) {
    this.drafts.set(view.key,{question:view.question.value,context:view.context.value,annotations:view.annotations.map(note=>({...note})),model:view.model.value || view.preferredModel || '',effort:view.effort.value || view.preferredEffort || ''});
    view.contextToggle.textContent=view.annotations.length ? `${view.annotations.length} 条注释${view.context.value?' · 已附文本':''}` : view.context.value ? `已附文本 · ${view.context.value.length.toLocaleString()} 字符` : '＋ 添加上下文';
    view.question.style.height='auto';view.question.style.height=Math.min(150,Math.max(54,view.question.scrollHeight))+'px';
  },
  transcript(key,title) {
    const messages=CodexReaderHost.sessions.get(key)?.messages;
    if (!messages?.length) throw new Error('当前会话还没有聊天记录。');
    return title+'\n\n'+messages.map(m=>(m.role==='user'?'我：':'Codex：')+'\n'+m.text+(m.error?'\n[错误] '+m.error:'')).join('\n\n');
  },
  update(view) {
    if (!view.root.isConnected) return;
    const host=CodexReaderHost;const session=host.sessions.get(view.key);const busy=!!session?.busy;
    view.status.textContent=busy?'Codex 正在回答…':host.status;
    view.connect.textContent=host.rpc && !host.rpc.closed?'重新连接':'连接 Codex';
    view.send.disabled=busy || !!view.submitting;view.stop.disabled=!busy;view.reset.disabled=busy || !!view.submitting;
    view.send.hidden=busy;view.stop.hidden=!busy;
    view.model.disabled=busy || !!view.submitting;
    view.deleteCurrent.disabled=busy || !!view.submitting;
    view.effort.disabled=busy || !!view.submitting || !view.effort.value;
    view.projectSelect.disabled=busy || !!view.submitting;
    this.updateProjects(view);
    view.login.hidden=host.accountReady;
    const modelJSON=JSON.stringify(host.models);
    if (view.lastModelJSON!==modelJSON) {
      view.lastModelJSON=modelJSON;const selected=view.preferredModel || view.model.value;if(host.models.length)view.preferredModel=undefined;
      view.model.replaceChildren(this.h(view.body.ownerDocument,'option',{value:''},'沿用 Codex 配置'));
      for (const model of host.models) view.model.append(this.h(view.body.ownerDocument,'option',{value:model.model || model.id},model.displayName || model.model || model.id));
      if ([...view.model.options].some(o=>o.value===selected)) view.model.value=selected;
    }
    this.updateEffort(view);
    const messages=session?.messages || [];
    const signature=JSON.stringify([messages,view.annotations]);
    if (view.lastMessages===signature) return;
    view.lastMessages=signature;
    const nearBottom=view.log.scrollHeight-view.log.scrollTop-view.log.clientHeight<90;
    view.log.replaceChildren();
    view.welcome.hidden=!!messages.length;view.log.hidden=!messages.length;
    for (const [messageIndex,message] of messages.entries()) {
      const article=this.h(view.body.ownerDocument,'article',{className:'cr-message cr-'+message.role,'data-message-index':messageIndex});
      article.append(this.h(view.body.ownerDocument,'strong',{},message.role==='user'?'你':'Codex'));
      if (message.context) article.append(this.h(view.body.ownerDocument,'div',{className:'cr-small'},`附带 ${message.context.length} 字符论文上下文`));
      if(message.projectContextLength)article.append(this.h(view.body.ownerDocument,'div',{className:'cr-small'},`已载入 ${message.projectContextLength} 字符近期项目对话背景`));
      const content=message.role==='assistant' ? CodexReaderMarkdown.render(view.body.ownerDocument,message.text || (message.status==='inProgress'?'正在思考…':'')) : this.h(view.body.ownerDocument,'div',{className:'cr-text'},message.text);
      if(message.role==='assistant')this.markAnnotations(view,content,messageIndex,messages);
      article.append(content);
      if(message.annotations?.length){const notes=this.h(view.body.ownerDocument,'details',{className:'cr-sent-annotations'});notes.append(this.h(view.body.ownerDocument,'summary',{},`${message.annotations.length} 条注释`));for(const [i,note] of message.annotations.entries()){notes.append(this.h(view.body.ownerDocument,'blockquote',{},`${i+1}. ${note.text}`));if(note.comment)notes.append(this.h(view.body.ownerDocument,'p',{},note.comment));}article.append(notes);}
      if (message.error) article.append(this.h(view.body.ownerDocument,'div',{className:'cr-error'},message.error));
      if (message.status==='interrupted') article.append(this.h(view.body.ownerDocument,'div',{className:'cr-small'},'回答已停止'));
      if (message.role==='assistant' && message.text && message.status!=='inProgress') {
        const copyMessage=this.h(view.body.ownerDocument,'button',{type:'button',className:'cr-copy-message','aria-label':'复制这条回答'},'复制');
        copyMessage.addEventListener('click',()=>{try{Zotero.Utilities.Internal.copyTextToClipboard(message.text);copyMessage.textContent='已复制';}catch(e){view.error.textContent=e.message;}});
        article.append(copyMessage);
      }
      view.log.append(article);
    }
    if (nearBottom) view.log.scrollTop=view.log.scrollHeight;
  },
  destroyView(body) {
    const view=this.views.get(body);if (!view) return;
    view.body.ownerDocument.defaultView.removeEventListener('focus',view.onWindowFocus);
    if(typeof CodexReaderPanel!=='undefined')CodexReaderPanel.detachView(view);
    this.saveDraft(view);this.views.delete(body);view.root.remove();if(!this.views.size && this.projectListener)CodexReaderProjects.stop(this.projectListener);
  },
  uninstall() {
    if(typeof CodexReaderPanel!=='undefined')CodexReaderPanel.uninstall();
    if (this.selectionHandler) Zotero.Reader.unregisterEventListener('renderTextSelectionPopup',this.selectionHandler);
    if (this.paneID) Zotero.ItemPaneManager.unregisterSection(this.paneID);
    CodexReaderHost.listeners.delete(this.updateListener);
    CodexReaderProjects.stop(this.projectListener);
    for (const body of [...this.views.keys()]) this.destroyView(body);
    this.drafts.clear();
  }
};
