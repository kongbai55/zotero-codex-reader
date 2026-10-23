/* Reader panel portal. Keep chat outside Zotero's scrolling item sections. */
var CodexReaderPanel = {
  windows:new Map(), observerID:null,
  install() {
    for (const win of Zotero.getMainWindows()) this.watchWindow(win);
    this.observerID=Zotero.Notifier.registerObserver({notify:(_action,type)=>{
      if(type!=='tab')return;
      for(const state of this.windows.values())if(state.active)this.schedule(state);
    }},['tab'],'codex-reader-panel');
  },
  watchWindow(win) {
    if(this.windows.has(win))return this.windows.get(win);
    const doc=win.document;
    const inner=doc.getElementById('zotero-context-pane-inner');
    const sidenav=doc.getElementById('zotero-context-pane-sidenav');
    if(!inner || !sidenav)return null;
    const element=CodexReaderUI.h(doc,'div',{className:'cr-reader-overlay',hidden:true,'aria-label':'Codex 阅读面板'});
    // Inline geometry also works while the stylesheet is still loading.
    Object.assign(element.style,{position:'fixed',zIndex:'100',overflow:'hidden',minWidth:'0',minHeight:'0'});
    inner.append(element);
    const state={win,inner,sidenav,element,active:false,view:null,timer:null,deck:null,previousInert:false};
    state.click=event=>{
      const button=event.target.closest?.('.btn');
      if(!button || event.button!==0)return;
      if(button.dataset.pane===CodexReaderUI.paneID) {
        event.preventDefault();event.stopImmediatePropagation();this.open(win);
      } else if(button.dataset.pane || button.dataset.action==='toggle-pane')this.close(state);
    };
    // Capture before the host scrolls the entire item pane to a section.
    sidenav.addEventListener('click',state.click,true);
    state.resize=()=>this.layout(state);
    state.resizeObserver=new win.ResizeObserver(state.resize);
    state.resizeObserver.observe(inner);state.resizeObserver.observe(sidenav);
    win.addEventListener('resize',state.resize);
    // Zotero captures file dragover on the window and immediately selects the
    // library for PDFs/EPUB/HTML. Observe at the chrome root before that handler,
    // including the approach across the reader on the way to the composer.
    state.dragRoot=win.windowRoot || win;
    state.drag=event=>{
      if(!state.active || !state.view || state.element.hidden || !CodexReaderAttachments.hasFiles(event.dataTransfer))return;
      const view=state.view,inside=state.element.contains(event.target);
      event.preventDefault();event.stopImmediatePropagation();
      event.dataTransfer.dropEffect=inside?'copy':'none';
      view.composer.classList.toggle('cr-dragover',inside && event.type!=='drop');
      if(event.type==='drop' && inside){
        const files=CodexReaderAttachments.fromTransfer(event.dataTransfer);
        if(files.length){view.error.textContent='';view.addAttachments(files).catch(error=>{view.error.textContent=error.message;});}
      }
    };
    state.dragClear=()=>state.view?.composer.classList.remove('cr-dragover');
    for(const type of ['dragenter','dragover','drop'])state.dragRoot.addEventListener(type,state.drag,true);
    state.dragRoot.addEventListener('dragend',state.dragClear,true);
    state.dragLeave=event=>{if(!event.relatedTarget || !state.element.contains(event.relatedTarget))state.dragClear();};
    state.element.addEventListener('dragleave',state.dragLeave);
    this.windows.set(win,state);
    return state;
  },
  schedule(state,attempt=0) {
    if(state.timer!==null)state.win.clearTimeout(state.timer);
    state.timer=state.win.setTimeout(()=>{state.timer=null;if(state.active)this.show(state,attempt);},50);
  },
  open(win) {
    const state=this.watchWindow(win);if(!state)return false;
    state.active=true;
    win.ZoteroContextPane.collapsed=false;
    this.show(state);
    return true;
  },
  show(state,attempt=0) {
    const {win,sidenav}=state;
    if(!state.active || win.closed)return;
    if(win.Zotero_Tabs.selectedType==='library') {this.releaseView(state);return;}
    const reader=Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID);
    const container=sidenav.container;
    const section=container?.getPane(CodexReaderUI.paneID);
    const body=section?.querySelector('[data-type="body"]');
    if(!reader || !body || container.tabID!==reader.tabID) {
      this.releaseView(state);
      if(attempt<20)this.schedule(state,attempt+1);
      return;
    }
    CodexReaderUI.render({body,item:container.item,doc:win.document});
    const view=CodexReaderUI.views.get(body);
    if(!view)return;
    if(state.view!==view) {
      this.releaseView(state);
      state.view=view;view.overlay=state;
      view.root.classList.add('cr-full-panel');
      state.element.replaceChildren(view.root);
    }
    const deck=win.document.getElementById('zotero-context-pane-deck');
    if(state.deck!==deck) {
      this.restoreDeck(state);
      state.deck=deck;state.previousInert=!!deck?.inert;
      if(deck)deck.inert=true;
    }
    this.layout(state);
    CodexReaderUI.update(view);
  },
  layout(state) {
    if(!state.active || !state.view || state.win.closed) {state.element.hidden=true;return;}
    const {win}=state;
    const r=state.inner.getBoundingClientRect(), n=state.sidenav.getBoundingClientRect();
    let left=Math.max(0,r.left),right=Math.min(win.innerWidth,r.right);
    const top=Math.max(0,r.top),bottom=Math.min(win.innerHeight,r.bottom);
    // In stacked layout the icon rail can be inside the same element.
    if(n.width>0 && n.height>0 && n.top<bottom && n.bottom>top) {
      if(n.left>left && n.left<right)right=n.left;
      else if(n.right>left && n.right<right)left=n.right;
    }
    const visible=right-left>0 && bottom-top>0 && win.getComputedStyle(state.inner).visibility==='visible';
    state.element.hidden=!visible;
    Object.assign(state.element.style,{left:left+'px',top:top+'px',width:Math.max(0,right-left)+'px',height:Math.max(0,bottom-top)+'px'});
  },
  restoreDeck(state) {
    if(state.deck)state.deck.inert=state.previousInert;
    state.deck=null;
  },
  releaseView(state) {
    this.restoreDeck(state);state.element.hidden=true;
    const view=state.view;state.view=null;
    if(view) {
      view.overlay=null;view.root.classList.remove('cr-full-panel');
      if(view.body.isConnected)view.body.append(view.root);else view.root.remove();
    }
  },
  close(state) {
    state.dragClear();
    state.active=false;
    if(state.timer!==null)state.win.clearTimeout(state.timer);
    state.timer=null;this.releaseView(state);
  },
  detachView(view) {if(view.overlay)this.releaseView(view.overlay);},
  releaseWindow(win) {
    const state=this.windows.get(win);if(!state)return;
    this.close(state);state.resizeObserver.disconnect();
    state.sidenav.removeEventListener('click',state.click,true);
    for(const type of ['dragenter','dragover','drop'])state.dragRoot.removeEventListener(type,state.drag,true);
    state.dragRoot.removeEventListener('dragend',state.dragClear,true);
    state.element.removeEventListener('dragleave',state.dragLeave);
    win.removeEventListener('resize',state.resize);state.element.remove();this.windows.delete(win);
  },
  uninstall() {
    if(this.observerID!==null)Zotero.Notifier.unregisterObserver(this.observerID);
    this.observerID=null;
    for(const win of [...this.windows.keys()])this.releaseWindow(win);
  }
};
