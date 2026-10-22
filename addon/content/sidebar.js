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
      const button = this.h(event.doc,'button',{type:'button'},'加入 Codex 上下文');
      button.addEventListener('click',()=>{
        const key = String(event.reader.itemID || event.reader._item?.id);
        const page = event.params.annotation?.pageLabel;
        const state = this.drafts.get(key) || {question:'',context:''};
        state.context = (page ? `[原文页码标签：${page}]\n` : '')+text;
        this.drafts.set(key,state);
        if(typeof CodexReaderPanel==='undefined' || !event.reader._window || !CodexReaderPanel.open(event.reader._window))event.reader.setContextPaneOpen(true);
        for (const view of this.views.values()) if (view.key === key) {
          view.context.value = state.context; view.contextInfo.textContent = `已加入选文：${state.context.length} 字符；发送前可编辑。`;
          this.saveDraft(view); view.question.focus(); view.root.scrollIntoView({block:'nearest'});
        }
        button.textContent = '已加入，打开右侧 Codex 栏发送';
      });
      event.append(button);
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
    const model = h('select',{'aria-label':'模型'});
    const historyLoad = h('button',{type:'button'},'加载 Codex 历史');
    details.append(h('p',{className:'cr-small'},'App 的专属工具及进行中状态不保证同步。'));
    const quota = h('button',{type:'button'},'查看账户用量');const quotaInfo = h('div',{className:'cr-small'}); details.append(quota,quotaInfo);
    const log = h('div',{className:'cr-log',role:'log','aria-label':'聊天记录'});
    const contextDetails = h('details',{className:'cr-context cr-panel'});contextDetails.append(h('summary',{},'发送的论文上下文（可预览、编辑）'));
    const contextInfo = h('div',{className:'cr-small'},'默认不自动发送论文正文。可在 PDF 中选中文字后点击“加入 Codex 上下文”。');
    const context = h('textarea',{rows:6,placeholder:'这里的内容会在你点击发送时交给 Codex。','aria-label':'论文上下文'});
    const contextBar = h('div',{className:'cr-toolbar'});
    const extract = h('button',{type:'button'},'提取前 20 页文本'); const clearContext = h('button',{type:'button'},'清空上下文');
    contextBar.append(extract,clearContext);contextDetails.append(contextInfo,context,contextBar);
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
    const contextToggle=h('button',{type:'button',className:'cr-context-toggle','aria-expanded':'false',title:'预览、编辑或提取论文上下文'},'＋ 论文上下文');
    const composerBar=h('div',{className:'cr-composer-bar'});
    send.className='cr-send';send.title='发送（Ctrl+Enter）';send.setAttribute('aria-label','发送');
    stop.className='cr-stop';stop.title='停止生成';
    composerBar.append(contextToggle,model,send,stop);composer.append(question,composerBar);
    const bottom=h('div',{className:'cr-bottom'});
    bottom.append(error,composer,h('div',{className:'cr-footnote'},'Ctrl+Enter 发送 · 仅发送你添加的论文内容'));
    const navHeading=h('div',{className:'cr-nav-heading'});
    const navClose=h('button',{type:'button',className:'cr-icon','aria-label':'收起会话列表'},'×');
    navHeading.append(h('strong',{},'会话'),navClose);
    const current=h('button',{type:'button',className:'cr-current',title},'当前论文 · '+title);
    const historyList=h('div',{className:'cr-history-list'});
    historyList.append(h('p',{className:'cr-small'},'点击加载，查看最近的 Codex 对话。'));
    historyLoad.className='cr-history-load';
    nav.append(navHeading,current,historyLoad,historyList,h('p',{className:'cr-small'},'点击历史会话创建分支；后续消息不会同步回原对话。'));
    const settingsClose=h('button',{type:'button',className:'cr-panel-close','aria-label':'关闭连接设置'},'关闭');
    details.append(bar,copy,note,settingsClose);
    const contextClose=h('button',{type:'button',className:'cr-panel-close','aria-label':'关闭上下文预览'},'完成');
    contextDetails.append(contextClose);
    main.append(header,heading,conversation,bottom,details,contextDetails);
    shell.append(nav,main);root.append(style,shell);body.replaceChildren(root);
    view = {body,root,key,reader,attachmentID,paper,title,status,connect,login,reset,stop,log,context,contextInfo,question,send,error,model,lastModelJSON:'',contextDetails,welcome,contextToggle,nav,toggle};
    exitPanel.addEventListener('click',()=>{if(view.overlay)CodexReaderPanel.close(view.overlay);});
    const setNav=open=>{nav.hidden=!open;root.classList.toggle('cr-nav-open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'收起会话列表':'展开会话列表');};
    toggle.addEventListener('click',()=>setNav(nav.hidden));
    navClose.addEventListener('click',()=>{setNav(false);toggle.focus();});
    current.addEventListener('click',()=>{setNav(false);question.focus();});
    const setPanel=(panel,open)=>{details.open=false;contextDetails.open=false;panel.open=open;};
    settingsToggle.addEventListener('click',()=>setPanel(details,!details.open));
    contextToggle.addEventListener('click',()=>setPanel(contextDetails,!contextDetails.open));
    settingsClose.addEventListener('click',()=>{details.open=false;settingsToggle.focus();});
    contextClose.addEventListener('click',()=>{contextDetails.open=false;question.focus();});
    details.addEventListener('toggle',()=>settingsToggle.setAttribute('aria-expanded',String(details.open)));
    contextDetails.addEventListener('toggle',()=>contextToggle.setAttribute('aria-expanded',String(contextDetails.open)));
    root.addEventListener('keydown',event=>{if(event.key==='Escape'){if(contextDetails.open){contextDetails.open=false;contextToggle.focus();}else if(details.open){details.open=false;settingsToggle.focus();}else {setNav(false);toggle.focus();}event.stopPropagation();}});
    this.views.set(body,view);
    const draft = this.drafts.get(key); if (draft) {question.value=draft.question;context.value=draft.context;}
    question.addEventListener('input',()=>this.saveDraft(view));context.addEventListener('input',()=>this.saveDraft(view));
    const action = fn=>async()=>{error.textContent='';try{await fn();}catch(e){error.textContent=e.message;}this.update(view);};
    connect.addEventListener('click',action(async()=>{
      if (CodexReaderHost.rpc && !CodexReaderHost.rpc.closed) {
        if ([...CodexReaderHost.sessions.values()].some(s=>s.busy)) throw new Error('有回答正在生成，请先停止再重连。');
        await CodexReaderHost.disconnect();
      }
      await CodexReaderHost.connect();
    }));
    login.addEventListener('click',action(()=>CodexReaderHost.login()));
    reset.addEventListener('click',action(()=>CodexReaderHost.clearSession(key)));
    stop.addEventListener('click',action(async()=>{
      const session=CodexReaderHost.sessions.get(key);
      try {await session?.interrupt();} catch (_) {await CodexReaderHost.disconnect();}
    }));
    savePath.addEventListener('click',action(async()=>{
      if ([...CodexReaderHost.sessions.values()].some(s=>s.busy)) throw new Error('请先停止正在生成的回答。');
      Services.prefs.setStringPref('extensions.codexreader.binary',path.value.trim());
      await CodexReaderHost.disconnect();await CodexReaderHost.connect();
    }));
    historyLoad.addEventListener('click',action(async()=>{
      historyLoad.disabled=true;
      try {
        const threads=await CodexReaderHost.listHistory();historyList.replaceChildren();
        if (!threads.length) historyList.append(h('p',{className:'cr-small'},'暂无历史会话。'));
        for (const thread of threads) {
          const label=(thread.name || thread.preview || thread.id).slice(0,100);
          const entry=h('button',{type:'button',className:'cr-history-entry',title:'分支继续：'+label},label);
          entry.addEventListener('click',action(async()=>{
            if(view.submitting || CodexReaderHost.sessions.get(key)?.busy)throw new Error('请先停止正在生成的回答。');
            entry.disabled=true;
            try {await CodexReaderHost.forkHistory(key,thread.id);setNav(false);question.focus();}
            finally {entry.disabled=false;}
          }));historyList.append(entry);
        }
      } finally {historyLoad.disabled=false;}
    }));
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
    clearContext.addEventListener('click',()=>{context.value='';contextInfo.textContent='上下文已清空；已有会话仍记得之前发送的内容。需要移除会话上下文时请新建会话。';this.saveDraft(view);});
    const submit = action(async()=>{
      if(view.submitting || CodexReaderHost.sessions.get(key)?.busy)return;
      const input={question:question.value,title,context:context.value};CodexReaderCore.promptFor(input);
      view.submitting=true;this.update(view);
      try {
        await CodexReaderHost.connect();
        if (!CodexReaderHost.accountReady) throw new Error('请先在 Codex CLI 或此处完成官方登录。');
        const session=CodexReaderHost.getSession(key);
        const promise=session.send(input,model.value);
        question.value='';this.saveDraft(view);await promise;
      } finally {view.submitting=false;}
    });
    send.addEventListener('click',submit);
    question.addEventListener('keydown',event=>{if ((event.ctrlKey || event.metaKey) && event.key==='Enter' && !event.isComposing) {event.preventDefault();submit();}});
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
  saveDraft(view) {
    this.drafts.set(view.key,{question:view.question.value,context:view.context.value});
    view.contextToggle.textContent=view.context.value ? `已附上下文 · ${view.context.value.length.toLocaleString()} 字符` : '＋ 论文上下文';
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
    view.contextToggle.textContent=view.context.value ? `已附上下文 · ${view.context.value.length.toLocaleString()} 字符` : '＋ 论文上下文';
    view.login.hidden=host.accountReady;
    const modelJSON=JSON.stringify(host.models.map(m=>[m.id,m.model,m.displayName]));
    if (view.lastModelJSON!==modelJSON) {
      view.lastModelJSON=modelJSON;const selected=view.model.value;
      view.model.replaceChildren(this.h(view.body.ownerDocument,'option',{value:''},'沿用 Codex 配置'));
      for (const model of host.models) view.model.append(this.h(view.body.ownerDocument,'option',{value:model.model || model.id},model.displayName || model.model || model.id));
      if ([...view.model.options].some(o=>o.value===selected)) view.model.value=selected;
    }
    const messages=session?.messages || [];
    const signature=JSON.stringify(messages.map(m=>[m.role,m.text,m.error,m.status,m.context?.length]));
    if (view.lastMessages===signature) return;
    view.lastMessages=signature;
    const nearBottom=view.log.scrollHeight-view.log.scrollTop-view.log.clientHeight<90;
    view.log.replaceChildren();
    view.welcome.hidden=!!messages.length;view.log.hidden=!messages.length;
    for (const message of messages) {
      const article=this.h(view.body.ownerDocument,'article',{className:'cr-message cr-'+message.role});
      article.append(this.h(view.body.ownerDocument,'strong',{},message.role==='user'?'你':'Codex'));
      if (message.context) article.append(this.h(view.body.ownerDocument,'div',{className:'cr-small'},`附带 ${message.context.length} 字符论文上下文`));
      article.append(this.h(view.body.ownerDocument,'div',{className:'cr-text'},message.text || (message.status==='inProgress'?'正在思考…':'')));
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
    if(typeof CodexReaderPanel!=='undefined')CodexReaderPanel.detachView(view);
    this.saveDraft(view);this.views.delete(body);view.root.remove();
  },
  uninstall() {
    if(typeof CodexReaderPanel!=='undefined')CodexReaderPanel.uninstall();
    if (this.selectionHandler) Zotero.Reader.unregisterEventListener('renderTextSelectionPopup',this.selectionHandler);
    if (this.paneID) Zotero.ItemPaneManager.unregisterSection(this.paneID);
    CodexReaderHost.listeners.delete(this.updateListener);
    for (const body of [...this.views.keys()]) this.destroyView(body);
    this.drafts.clear();
  }
};
