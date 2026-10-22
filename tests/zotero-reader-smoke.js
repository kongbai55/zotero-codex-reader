// Test-only integration harness: real PDF reader, section lifecycle and Fluent.
// The isolated window stays open for visual inspection; no model request is sent.
async function runZoteroSmoke() {
  const root=PathUtils.parent(Zotero.Profile.dir);
  const output=PathUtils.join(root,'test-results','reader-smoke.json');
  const checks=[];
  let diagnostics={};
  const stage=async name=>IOUtils.writeJSON(output,{running:true,stage:name,checks});
  const record=(name,ok)=>{checks.push({name,ok:!!ok});if(!ok)throw new Error(name);};
  try {
    await stage('waiting for test window');
    await Zotero.Promise.delay(3000);
    const win=Zotero.getMainWindow();win.document.title='Codex Reader — isolated UI test';
    await stage('opening fixture PDF');
    const paper=new Zotero.Item('journalArticle');paper.setField('title','Codex Reader UI regression fixture');await paper.saveTx();
    const attachment=await Zotero.Attachments.importFromFile({file:PathUtils.join(root,'test-results','fixture.pdf'),parentItemID:paper.id});
    const reader=await Zotero.Reader.open(attachment.id);
    await stage('waiting for PDF reader');
    await reader._initPromise;
    win.ZoteroContextPane.collapsed=false;
    await Zotero.Promise.delay(1500);
    const paneID=codexScope.CodexReaderUI.paneID;
    const doc=win.document;
    const sidenav=doc.getElementById('zotero-context-pane-sidenav');
    const section=sidenav.container.getPane(paneID);
    record('real reader section exists',!!section);
    const collapse=section.querySelector('collapsible-section');
    const nav=[...sidenav.querySelectorAll('.btn')].find(e=>e.dataset.pane===paneID);
    record('real reader navigation exists',!!nav);
    await doc.l10n.translateElements([collapse,nav]);
    record('Fluent preserves section body',!!collapse.querySelector('[data-type="body"]'));
    record('Fluent sets section label',!!collapse.getAttribute('label'));
    record('navigation tooltip has no visible text',!!nav.getAttribute('tooltiptext') && !nav.textContent.trim());
    await stage('opening full reader panel');
    nav.dispatchEvent(new win.MouseEvent('click',{bubbles:true,button:0,detail:1}));
    await Zotero.Promise.delay(1200);
    const body=collapse.querySelector('[data-type="body"]');
    const view=codexScope.CodexReaderUI.views.get(body);
    record('reader lifecycle renders chat without manual render call',!!view && view.root.isConnected);
    const panel=codexScope.CodexReaderPanel.windows.get(win);
    record('Codex icon opens standalone panel',panel.active && panel.view===view && !panel.element.hidden);
    record('chat is outside scrolling item sections',!body.contains(view.root) && panel.element.contains(view.root));
    record('underlying modules cannot receive focus',doc.getElementById('zotero-context-pane-deck').inert);
    await stage('checking actual layout');
    const rect=view.root.getBoundingClientRect();
    const sendRect=view.send.getBoundingClientRect();
    diagnostics={ancestors:[],viewport:{width:win.innerWidth,height:win.innerHeight}};
    for(let e=view.root;e && diagnostics.ancestors.length<10;e=e.parentElement){const r=e.getBoundingClientRect(),s=win.getComputedStyle(e);diagnostics.ancestors.push({tag:e.tagName,id:e.id,class:e.className,rect:{x:r.x,y:r.y,width:r.width,height:r.height},display:s.display,visibility:s.visibility,overflow:s.overflow,position:s.position,open:e.open,hidden:e.hidden});}
    record('chat has usable width and height',rect.width>200 && rect.height>300);
    record('composer is visible in window',sendRect.width>0 && sendRect.bottom<win.innerHeight && sendRect.top>0);
    record('chat has no horizontal overflow',view.root.scrollWidth<=view.root.clientWidth+1);
    const innerRect=doc.getElementById('zotero-context-pane-inner').getBoundingClientRect();
    const railRect=sidenav.getBoundingClientRect();
    record('panel covers native header and full content height',Math.abs(rect.top-innerRect.top)<1 && Math.abs(rect.bottom-Math.min(innerRect.bottom,win.innerHeight))<1);
    record('panel ends before icon rail',rect.right<=railRect.left+1);
    record('send button is completely inside panel',sendRect.right<=rect.right && sendRect.left>=rect.left);
    const hostScroll=sidenav.container._paneParent;
    const originalScroll=hostScroll.scrollTop;
    codexScope.CodexReaderHost.sessions.set(view.key,{messages:[{role:'assistant',text:Array(150).fill('Long conversation fixture: scroll only inside Codex.').join('\n'),status:'completed'}]});
    codexScope.CodexReaderUI.update(view);
    await Zotero.Promise.delay(200);
    const before=view.send.getBoundingClientRect();
    view.log.scrollTop=view.log.scrollHeight;
    record('long messages scroll independently',view.log.scrollHeight>view.log.clientHeight && hostScroll.scrollTop===originalScroll);
    record('composer stays within panel for long messages',Math.abs(view.send.getBoundingClientRect().bottom-before.bottom)<1 && view.root.scrollHeight<=view.root.clientHeight+1);
    view.contextToggle.click();record('context panel opens in real reader',view.contextDetails.open);
    view.root.querySelector('[aria-label="关闭上下文预览"]').click();
    await doc.l10n.translateElements([collapse,nav]);
    record('retranslation preserves live chat controls',view.send.isConnected && panel.element.contains(view.send));
    view.question.value='preserved draft';codexScope.CodexReaderUI.saveDraft(view);
    const info=[...sidenav.querySelectorAll('.btn')].find(e=>e.dataset.pane==='info');
    info.dispatchEvent(new win.MouseEvent('click',{bubbles:true,button:0,detail:1}));
    record('other icons restore normal Zotero modules',!panel.active && panel.element.hidden && !doc.getElementById('zotero-context-pane-deck').inert);
    nav.dispatchEvent(new win.MouseEvent('click',{bubbles:true,button:0,detail:1}));
    record('reopening preserves chat and draft',panel.active && panel.view===view && view.question.value==='preserved draft');
    const outer=doc.getElementById('zotero-context-pane');
    const oldWidth=outer.style.width, oldWidthAttribute=outer.getAttribute('width');
    outer.setAttribute('width','440');outer.style.width='440px';await Zotero.Promise.delay(300);
    // Hidden test windows can suspend observer delivery; exercise the registered resize callback.
    panel.resize();
    const wide=view.root.getBoundingClientRect(), wideInner=doc.getElementById('zotero-context-pane-inner').getBoundingClientRect();
    diagnostics.wider={width:wide.width,inner:wideInner.width,outer:outer.getBoundingClientRect().width,initial:rect.width};
    record('panel respects actual host width constraints',Math.abs(wide.width-wideInner.width)<1 && wide.right<=sidenav.getBoundingClientRect().left+1);
    outer.setAttribute('width','280');outer.style.width='280px';await Zotero.Promise.delay(300);panel.resize();
    const narrow=view.root.getBoundingClientRect(), narrowSend=view.send.getBoundingClientRect();
    diagnostics.resized={width:narrow.width,inner:doc.getElementById('zotero-context-pane-inner').getBoundingClientRect().width,sendRight:narrowSend.right,right:narrow.right,railLeft:sidenav.getBoundingClientRect().left};
    // Zotero enforces its own minimum pane width; check actual bounds, not the requested width.
    record('resized narrow panel keeps send button inside',narrow.width>200 && Math.abs(narrow.width-diagnostics.resized.inner)<1 && narrowSend.right<=narrow.right && narrow.right<=sidenav.getBoundingClientRect().left+1);
    outer.setAttribute('width',oldWidthAttribute);outer.style.width=oldWidth;await Zotero.Promise.delay(200);panel.resize();
    const secondPaper=new Zotero.Item('journalArticle');secondPaper.setField('title','Second paper isolation fixture');await secondPaper.saveTx();
    const secondAttachment=await Zotero.Attachments.importFromFile({file:PathUtils.join(root,'test-results','fixture.pdf'),parentItemID:secondPaper.id});
    const secondReader=await Zotero.Reader.open(secondAttachment.id);await secondReader._initPromise;await Zotero.Promise.delay(1000);
    record('switching papers shows a separate chat',panel.active && panel.view?.key===String(secondAttachment.id) && panel.view.question.value==='');
    win.Zotero_Tabs.select(reader.tabID);await Zotero.Promise.delay(1000);
    record('returning to paper restores its own draft',panel.view===view && view.question.value==='preserved draft');
    codexScope.CodexReaderPanel.releaseWindow(win);
    record('panel cleanup restores host interaction',!doc.getElementById('zotero-context-pane-deck').inert && !doc.querySelector('.cr-reader-overlay'));
    codexScope.CodexReaderPanel.open(win);
    record('panel can reopen after cleanup',codexScope.CodexReaderPanel.windows.get(win)?.view===view);
    codexScope.CodexReaderHost.sessions.delete(view.key);view.question.value='';codexScope.CodexReaderUI.saveDraft(view);codexScope.CodexReaderUI.update(view);
    win.document.title='Codex Reader — isolated UI test';
    await IOUtils.writeJSON(output,{success:true,zoteroVersion:Zotero.version,checks,layout:{root:{width:rect.width,height:rect.height},sendBottom:sendRect.bottom,windowHeight:win.innerHeight}});
  } catch(error) {
    const errors=Services.console.getMessageArray().map(m=>m.message).filter(m=>/TypeError|ReferenceError|Error:/.test(m)).slice(-10);
    await IOUtils.writeJSON(output,{success:false,checks,error:String(error),stack:error.stack,errors,diagnostics});
  }
}
