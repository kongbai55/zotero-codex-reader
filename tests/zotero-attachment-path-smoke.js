// Runs only in an isolated test profile, with real Gecko IOUtils and fixture bytes.
async function runZoteroSmoke(rootURI) {
  const root='D:\\open source\\zotero-codex',checks=[];
  const output=PathUtils.join(root,'test-results','attachment-path-smoke.json');
  const record=(name,ok)=>{checks.push({name,ok:!!ok});if(!ok)throw new Error(name);};
  try {
    const base=PathUtils.join(root,'test-results','attachment-paths');
    const profile=PathUtils.join(base,'p'.repeat(70-base.length-1));
    await IOUtils.makeDirectory(profile,{createAncestors:true});
    const scope={Zotero:{Profile:{dir:profile}},Services,IOUtils,PathUtils};
    Services.scriptloader.loadSubScript(rootURI+'content/attachments.js',scope,'UTF-8');
    const api=scope.CodexReaderAttachments,win=Zotero.getMainWindow();
    const source=PathUtils.join(root,'test-results','fixture.pdf');
    const original=await IOUtils.read(source);
    const name='Tsujimura 等 - 2026 - Assessing the Belief Consistency of Large Language Models on the Logical Conversation Process.pdf';
    record('fixture reproduces the original 261 character destination',PathUtils.join(profile,'codex-reader-workspace','attachments','94b2f234-4981-4bd4-bb7e-a67bcbf36df9',name).length===261);
    const first=await api.import({path:source,name},win);
    const second=await api.import({path:source,name},win);
    record('long PDF name is preserved with a short existing copy',first.name===name && first.path.length<=240 && await IOUtils.exists(first.path));
    const bytes=await IOUtils.read(first.path);
    record('PDF extension and complete bytes are preserved',first.path.endsWith('file.pdf') && bytes.length===original.length && bytes.every((b,i)=>b===original[i]));
    record('same name attachments remain independent',first.path!==second.path && await IOUtils.exists(second.path));
    const longName='长标题😀'.repeat(60)+'.md';
    const text=await api.import(new win.File(['完整内容'],longName),win);
    record('Unicode names and local text decoding are preserved',text.name===longName && text.text==='完整内容' && text.path.endsWith('file.md'));
    await api.discard(first);await api.discard(second);await api.discard(text);
    record('discard removes managed copies while preserving the source',!await IOUtils.exists(first.path) && !await IOUtils.exists(second.path) && !await IOUtils.exists(text.path) && await IOUtils.exists(source));
    await IOUtils.writeJSON(output,{success:true,zoteroVersion:Zotero.version,checks});
  } catch(error) {
    await IOUtils.writeJSON(output,{success:false,checks,error:String(error),stack:error.stack});
  } finally {
    Services.startup.quit(Components.interfaces.nsIAppStartup.eForceQuit);
  }
}
