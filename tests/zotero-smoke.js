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
    const extraction=await Zotero.PDFWorker.getFullText(attachment.id,20);
    record('PDF extraction works',extraction.text.includes('Fixture paper'));
    const popup=win.document.createElement('div');
    codexScope.CodexReaderUI.selectionHandler({doc:win.document,reader,params:{annotation:{text:'Selected fixture paragraph',pageLabel:'1'}},append:element=>popup.append(element)});
    popup.firstElementChild.click();
    record('selection requires explicit button and reaches matching paper',view.context.value.includes('Selected fixture paragraph'));
    const session=new codexScope.CodexReaderCore.Session({request:async method=>method==='thread/start'?{thread:{id:'fixture-thread'}}:{turn:{id:'fixture-turn',status:'inProgress'}}},'D:\\fixture',()=>codexScope.CodexReaderHost.emit());
    codexScope.CodexReaderHost.sessions.set(view.key,session);
    await session.send({question:'Explain fixture',context:'Selected fixture paragraph'});
    session.event('item/agentMessage/delta',{threadId:'fixture-thread',turnId:'fixture-turn',itemId:'msg',delta:'<img src="https://example.invalid/tracker" onerror="bad()">'});
    session.event('turn/completed',{threadId:'fixture-thread',turn:{id:'fixture-turn',status:'completed'}});
    codexScope.CodexReaderUI.update(view);
    record('streamed output displayed as text',view.log.textContent.includes('<img'));
    record('model output cannot create remote images',view.log.querySelector('img')===null);
    record('finished turn unlocks send',!view.send.disabled);
    // Exercise host Subprocess in the actual Gecko runtime, but never send a model turn.
    codexScope.CodexReaderHost.sessions.clear();
    const rpc=await codexScope.CodexReaderHost.connect();
    record('native Codex stdio handshake in Zotero',!!rpc && !rpc.closed);
    record('existing account detected',codexScope.CodexReaderHost.accountReady);
    record('existing model catalog available',codexScope.CodexReaderHost.models.length>0);
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
