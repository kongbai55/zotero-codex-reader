// Injected ONLY into a throwaway test extension, never packaged in the release XPI.
async function runZoteroSmoke(rootURI) {
  const checks=[];
  const record=(name,ok)=>{checks.push({name,ok:!!ok});if(!ok)throw new Error(name);};
  const output=PathUtils.join('D:\\open source\\zotero-codex','test-results','zotero-smoke.json');
  try {
    await IOUtils.writeJSON(output,{running:true,stage:'waiting for window'});
    // A hidden test window can suspend React's first-frame callback, so do not
    // depend on uiReadyPromise or open a PDF viewer in this background smoke test.
    await Zotero.Promise.delay(3000);
    const win=Zotero.getMainWindow();
    record('plugin scope loaded',!!codexScope?.CodexReaderUI);
    record('official section registration',!!codexScope.CodexReaderUI.paneID);
    const paper=new Zotero.Item('journalArticle');paper.setField('title','Codex Reader integration fixture');
    paper.setField('date','2026');await paper.saveTx();
    const attachment=await Zotero.Attachments.importFromFile({file:'D:\\open source\\zotero-codex\\test-results\\fixture.pdf',parentItemID:paper.id});
    const reader={itemID:attachment.id,setContextPaneOpen(){}};
    const body=win.document.createElementNS('http://www.w3.org/1999/xhtml','div');
    win.document.documentElement.append(body);
    codexScope.CodexReaderUI.render({body,item:attachment,doc:win.document});
    let view=codexScope.CodexReaderUI.views.get(body);
    record('sidebar DOM rendered in actual Zotero window',!!view);
    record('correct paper title',view.title==='Codex Reader integration fixture');
    record('context empty until explicitly added',view.context.value==='');
    record('send and stop buttons exist',view.send.textContent==='发送' && view.stop.disabled);
    view.toggle.click();record('history navigation opens',!view.nav.hidden);
    view.root.querySelector('[aria-label="收起会话列表"]').click();record('history navigation closes',view.nav.hidden);
    view.contextToggle.click();record('context preview opens',view.contextDetails.open);
    view.root.querySelector('[aria-label="关闭上下文预览"]').click();record('context preview closes',!view.contextDetails.open);
    view.root.querySelector('.cr-welcome button').click();
    record('quick prompt only fills draft',view.question.value.length>0 && !codexScope.CodexReaderHost.sessions.has(view.key));
    const extraction=await Zotero.PDFWorker.getFullText(attachment.id,20);
    record('PDF extraction works',extraction.text.includes('Fixture paper'));
    const popup=win.document.createElement('div');
    codexScope.CodexReaderUI.selectionHandler({doc:win.document,reader,params:{annotation:{text:'Selected fixture paragraph',pageLabel:'1'}},append:element=>popup.append(element)});
    popup.querySelector('button').click();
    record('selection requires explicit button and reaches matching paper',view.annotations[0]?.text==='Selected fixture paragraph');
    const secondPopup=win.document.createElement('div');
    codexScope.CodexReaderUI.selectionHandler({doc:win.document,reader,params:{annotation:{text:'Second fixture paragraph',pageLabel:'2'}},append:element=>secondPopup.append(element)});
    secondPopup.querySelector('textarea').value='Explain this';secondPopup.querySelector('button').click();
    record('multiple excerpts accumulate with comments and page labels',view.annotations.length===2 && view.annotations[1].comment==='Explain this' && view.annotations[1].page==='2');
    record('composer displays numbered annotation chips',view.annotationPreview.children.length===2 && view.contextToggle.textContent.includes('2 条注释'));
    const session=new codexScope.CodexReaderCore.Session({request:async method=>method==='thread/start'?{thread:{id:'fixture-thread'}}:{turn:{id:'fixture-turn',status:'inProgress'}}},'D:\\fixture',()=>codexScope.CodexReaderHost.emit());
    codexScope.CodexReaderHost.sessions.set(view.key,session);
    await session.send({question:'Explain fixture',context:'Selected fixture paragraph'});
    record('busy composer shows stop and disables new conversation',view.send.hidden && !view.stop.hidden && view.reset.disabled);
    session.event('item/agentMessage/delta',{threadId:'fixture-thread',turnId:'fixture-turn',itemId:'msg',delta:'<img src="https://example.invalid/tracker" onerror="bad()">'});
    session.event('turn/completed',{threadId:'fixture-thread',turn:{id:'fixture-turn',status:'completed'}});
    codexScope.CodexReaderUI.update(view);
    record('streamed output displayed as text',view.log.textContent.includes('<img'));
    record('model output cannot create remote images',view.log.querySelector('img')===null);
    record('finished turn unlocks send',!view.send.disabled);
    record('completed conversation hides welcome and shows messages',view.welcome.hidden && !view.log.hidden && view.stop.hidden);
    // Exercise host Subprocess in the actual Gecko runtime, but never send a model turn.
    codexScope.CodexReaderHost.sessions.clear();
    const rpc=await codexScope.CodexReaderHost.connect();
    record('native Codex stdio handshake in Zotero',!!rpc && !rpc.closed);
    record('existing account detected',codexScope.CodexReaderHost.accountReady);
    record('existing model catalog available',codexScope.CodexReaderHost.models.length>0);
    view.model.value=codexScope.CodexReaderHost.models[0].model;view.model.dispatchEvent(new win.Event('change'));
    record('reasoning options match local model capabilities',view.effort.options.length===codexScope.CodexReaderHost.models[0].supportedReasoningEfforts.length);
    const formatted=codexScope.CodexReaderMarkdown.render(win.document,'## Heading\n\n**bold** and `code`\n\n| A | B |\n|---|---|\n|1|2|\n\n$$x^2$$\n\n<script>bad()</script>\n\n[bad](javascript:bad)');
    record('Markdown headings bold code and tables render',formatted.querySelector('h2') && formatted.querySelector('strong') && formatted.querySelector('code') && formatted.querySelector('table'));
    record('formulas render as native MathML',formatted.querySelector('math'));
    record('formatted responses keep HTML and unsafe URLs inert',!formatted.querySelector('script') && !formatted.querySelector('a[href^="javascript:"]'));
    const projectFolder=PathUtils.join(PathUtils.parent(Zotero.Profile.dir),'test-results','shared-memory-fixture');
    await IOUtils.makeDirectory(projectFolder,{ignoreExisting:true});
    await IOUtils.writeUTF8(PathUtils.join(projectFolder,'AGENTS.md'),'Existing guidance\n');
    codexScope.CodexReaderProjects.save({projects:[{name:'Fixture project',path:projectFolder}],bindings:{[view.key]:projectFolder}});
    codexScope.CodexReaderUI.update(view);
    record('project list binds the paper to its folder',view.projectSelect.value===projectFolder);
    await codexScope.CodexReaderProjects.saveMemory(projectFolder,'Existing guidance\nShared research memory\n','Existing guidance\n');
    record('shared project guidance persists in AGENTS.md',(await codexScope.CodexReaderProjects.readMemory(projectFolder)).includes('Shared research memory'));
    record('new conversation uses the shared project cwd',codexScope.CodexReaderHost.getSession(view.key).cwd===projectFolder);
    const syncHome=PathUtils.join(PathUtils.parent(Zotero.Profile.dir),'test-results','project-sync-home');await IOUtils.makeDirectory(syncHome,{ignoreExisting:true});
    const syncFile=PathUtils.join(syncHome,'.codex-global-state.json');
    Services.prefs.setStringPref('extensions.codexreader.home',syncHome);
    await IOUtils.writeJSON(syncFile,{'local-projects':{'sync-project':{id:'sync-project',name:'Synced Codex project',rootPaths:[projectFolder]}}});
    await codexScope.CodexReaderProjects.sync();
    record('desktop project registry automatically populates project picker',view.projectSelect.querySelector('option[value="sync-project"]')?.textContent==='Synced Codex project');
    record('existing paper folder binding migrates to stable Codex identity',view.projectSelect.value==='sync-project');
    await IOUtils.writeJSON(syncFile,{'local-projects':{'sync-project':{id:'sync-project',name:'Renamed Codex project',rootPaths:[projectFolder]}}});
    await Zotero.Promise.delay(5500);
    record('automatic polling detects Codex project rename without clicking import',view.projectSelect.selectedOptions[0]?.textContent==='Renamed Codex project');
    await IOUtils.writeJSON(syncFile,{'local-projects':{}});await codexScope.CodexReaderProjects.sync();
    record('removed bound project is visibly unavailable',view.projectSelect.selectedOptions[0]?.disabled && view.projectSelect.selectedOptions[0]?.textContent.includes('移除'));
    let removedBlocked=false;try{codexScope.CodexReaderHost.getSession(view.key);}catch(_){removedBlocked=true;}
    record('removed project cannot silently reuse its old conversation',removedBlocked);
    const history=await codexScope.CodexReaderHost.listHistory();
    record('existing Codex history readable',Array.isArray(history));
    await codexScope.CodexReaderHost.disconnect();
    await IOUtils.writeJSON(output,{success:true,zoteroVersion:Zotero.version,checks},{tmpPath:output+'.tmp'});
  }catch(error) {
    await IOUtils.writeJSON(output,{success:false,checks,error:String(error),stack:error.stack},{tmpPath:output+'.tmp'});
  }finally {
    setTimeout(()=>Services.startup.quit(Components.interfaces.nsIAppStartup.eForceQuit),500);
  }
}
