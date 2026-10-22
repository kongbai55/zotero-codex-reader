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
        event.reader.setContextPaneOpen(true);
        for (const view of this.views.values()) if (view.key === key) {
          view.context.value = state.context; view.contextInfo.textContent = `已加入选文：${state.context.length} 字符；发送前可编辑。`;
          view.question.focus(); view.root.scrollIntoView({block:'nearest'});
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
    const style = h('link',{rel:'stylesheet',href:this.rootURI+'content/sidebar.css'});root.append(style);
    root.append(h('div',{className:'cr-title'},title));
    const status = h('div',{className:'cr-status',role:'status','aria-live':'polite'}); root.append(status);
    const bar = h('div',{className:'cr-toolbar'});
    const connect = h('button',{type:'button'},'连接 Codex');
    const login = h('button',{type:'button'},'官方登录');
    const reset = h('button',{type:'button'},'新会话');
    const stop = h('button',{type:'button'},'停止');
    bar.append(connect,login,reset,stop);root.append(bar);
    const details = h('details',{className:'cr-settings'});
    details.append(h('summary',{},'连接设置与已有会话'));
    const description = h('p',{},'直接使用现有 Codex 登录、配置和服务。插件不读取凭证文件、不增加中转。聊天与工具调用遵循 Codex 当前设置。');details.append(description);
    const path = h('input',{type:'text',placeholder:'自动寻找 Codex；也可填 codex.exe / codex.cmd 的完整路径',value:Services.prefs.getStringPref('extensions.codexreader.binary',''),'aria-label':'Codex 可执行文件路径'});
    details.append(path);
    const savePath = h('button',{type:'button'},'保存路径并重连');details.append(savePath);
    const model = h('select',{'aria-label':'模型'});details.append(h('label',{},'模型：'),model);
    const historyBar = h('div',{className:'cr-toolbar'});
    const historyLoad = h('button',{type:'button'},'加载 Codex 历史');
    const historyFork = h('button',{type:'button'},'分支继续聊');
    const history = h('select',{'aria-label':'已有 Codex 会话'});history.append(h('option',{value:''},'先加载历史会话'));
    historyBar.append(historyLoad,historyFork);details.append(historyBar,history,h('p',{className:'cr-small'},'从已有会话创建分支，原对话不变。App 的专属工具及进行中状态不保证同步。'));
    const quota = h('button',{type:'button'},'查看账户用量');const quotaInfo = h('div',{className:'cr-small'}); details.append(quota,quotaInfo);
    root.append(details);
    const log = h('div',{className:'cr-log',role:'log','aria-label':'聊天记录'});root.append(log);
    const contextDetails = h('details',{className:'cr-context'});contextDetails.append(h('summary',{},'发送的论文上下文（可预览、编辑）'));
    const contextInfo = h('div',{className:'cr-small'},'默认不自动发送论文正文。可在 PDF 中选中文字后点击“加入 Codex 上下文”。');
    const context = h('textarea',{rows:6,placeholder:'这里的内容会在你点击发送时交给 Codex。','aria-label':'论文上下文'});
    const contextBar = h('div',{className:'cr-toolbar'});
    const extract = h('button',{type:'button'},'提取前 20 页文本'); const clearContext = h('button',{type:'button'},'清空上下文');
    contextBar.append(extract,clearContext);contextDetails.append(contextInfo,context,contextBar);root.append(contextDetails);
    const question = h('textarea',{rows:3,placeholder:'向 Codex 提问… Ctrl+Enter 发送','aria-label':'问题'});root.append(question);
    const prompts = h('div',{className:'cr-toolbar'});
    for (const [label,text] of [['总结','请根据提供的论文内容，总结研究问题、方法、主要发现和局限。请说明当前上下文没有覆盖的部分。'],['解释','请解释选文的含义、关键术语和推理过程，区分原文结论与你的补充解释。'],['翻译','请准确翻译提供的选文，保留公式和专业术语。']]) {
      const button = h('button',{type:'button'},label);button.addEventListener('click',()=>{question.value=text;this.saveDraft(view);question.focus();});prompts.append(button);
    }
    root.append(prompts);
    const footer = h('div',{className:'cr-toolbar'});
    const send = h('button',{type:'button',className:'cr-send'},'发送');
    const copy = h('button',{type:'button'},'复制对话'); const note = h('button',{type:'button'},'存为笔记');
    footer.append(send,copy,note);root.append(footer);
    const error = h('div',{className:'cr-error',role:'alert'});root.append(error);
    root.append(h('div',{className:'cr-small'},'只在点击发送时提交问题、论文标题及上方上下文。Codex 按现有配置联网及保存记录。'));
    body.replaceChildren(root);
    view = {body,root,key,reader,attachmentID,paper,title,status,connect,login,reset,stop,log,context,contextInfo,question,send,error,model,lastModelJSON:'',contextDetails};
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
      const threads=await CodexReaderHost.listHistory();history.replaceChildren(h('option',{value:''},'选择已有对话（最近 40 条）'));
      for (const thread of threads) history.append(h('option',{value:thread.id},(thread.name || thread.preview || thread.id).slice(0,100)));
    }));
    historyFork.addEventListener('click',action(async()=>{
      if (!history.value) throw new Error('请先选择已有会话。');
      await CodexReaderHost.forkHistory(key,history.value);
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
        contextDetails.open=true;this.saveDraft(view);
      } finally {extract.disabled=false;}
    }));
    clearContext.addEventListener('click',()=>{context.value='';contextInfo.textContent='上下文已清空；已有会话仍记得之前发送的内容。需要移除会话上下文时请新建会话。';this.saveDraft(view);});
    const submit = action(async()=>{
      const input={question:question.value,title,context:context.value};CodexReaderCore.promptFor(input);
      await CodexReaderHost.connect();
      if (!CodexReaderHost.accountReady) throw new Error('请先在 Codex CLI 或此处完成官方登录。');
      const session=CodexReaderHost.getSession(key);
      const promise=session.send(input,model.value);
      question.value='';this.saveDraft(view);await promise;
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
  saveDraft(view) {this.drafts.set(view.key,{question:view.question.value,context:view.context.value});},
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
    view.send.disabled=busy;view.stop.disabled=!busy;view.reset.disabled=busy;
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
    if (!messages.length) view.log.append(this.h(view.body.ownerDocument,'p',{className:'cr-empty'},'选取论文中的一段文字，或展开上下文提取文本，再提问。\n\n也可以直接聊天，或从 Codex 历史会话创建分支。'));
    for (const message of messages) {
      const article=this.h(view.body.ownerDocument,'article',{className:'cr-message cr-'+message.role});
      article.append(this.h(view.body.ownerDocument,'strong',{},message.role==='user'?'你':'Codex'));
      if (message.context) article.append(this.h(view.body.ownerDocument,'div',{className:'cr-small'},`附带 ${message.context.length} 字符论文上下文`));
      article.append(this.h(view.body.ownerDocument,'div',{className:'cr-text'},message.text || (message.status==='inProgress'?'正在思考…':'')));
      if (message.error) article.append(this.h(view.body.ownerDocument,'div',{className:'cr-error'},message.error));
      if (message.status==='interrupted') article.append(this.h(view.body.ownerDocument,'div',{className:'cr-small'},'回答已停止'));
      view.log.append(article);
    }
    if (nearBottom) view.log.scrollTop=view.log.scrollHeight;
  },
  destroyView(body) {
    const view=this.views.get(body);if (!view) return;
    this.saveDraft(view);this.views.delete(body);view.root.remove();
  },
  uninstall() {
    if (this.selectionHandler) Zotero.Reader.unregisterEventListener('renderTextSelectionPopup',this.selectionHandler);
    if (this.paneID) Zotero.ItemPaneManager.unregisterSection(this.paneID);
    CodexReaderHost.listeners.delete(this.updateListener);
    for (const body of [...this.views.keys()]) this.destroyView(body);
    this.drafts.clear();
  }
};
