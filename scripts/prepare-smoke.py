"""Prepare an isolated Zotero profile. Never reads or modifies the user's Zotero library."""
from pathlib import Path
import shutil
import json
import zipfile
import sys

root=Path(__file__).resolve().parents[1]
suffix_name=sys.argv[1] if len(sys.argv)>1 else ''
assert all(c.isalnum() or c=='-' for c in suffix_name)
profile=root/('.test-profile'+suffix_name)
data=root/('.test-data'+suffix_name)
results=root/'test-results'
for p in (profile,data,results): p.mkdir(exist_ok=True)
extension=profile/'extensions'/'codex-reader@kongbai55.local.xpi'
extension.parent.mkdir(exist_ok=True)
files={p.relative_to(root/'addon').as_posix():p.read_bytes() for p in (root/'addon').rglob('*') if p.is_file()}
suffix='''
var originalStartup = startup;
startup = async function(data, reason) {
  try {
    await originalStartup(data, reason);
    Services.scriptloader.loadSubScript(data.rootURI+'test-smoke.js',this,'UTF-8');
    runZoteroSmoke(data.rootURI);
  } catch(error) {
    await IOUtils.writeJSON('D:\\\\open source\\\\zotero-codex\\\\test-results\\\\zotero-smoke.json', {success:false,error:String(error),stack:error.stack});
    Services.startup.quit(Components.interfaces.nsIAppStartup.eForceQuit);
  }
};
'''
files['bootstrap.js']+=suffix.encode()
mode=sys.argv[2] if len(sys.argv)>2 else 'default'
test_script = {'reader':'zotero-reader-smoke.js','attachment-path':'zotero-attachment-path-smoke.js','default':'zotero-smoke.js'}[mode]
files['test-smoke.js']=(root/'tests'/test_script).read_bytes()
with zipfile.ZipFile(extension,'w',zipfile.ZIP_DEFLATED) as z:
 for name,content in files.items():z.writestr(name,content)
prefs={
 'extensions.autoDisableScopes':0,'extensions.enabledScopes':15,
 'extensions.startupScanScopes':15,'xpinstall.signatures.required':False,
 'extensions.zotero.useDataDir':True,'extensions.zotero.dataDir':str(data),
 'extensions.zotero.firstRun2':False,'extensions.zotero.firstRunGuidance':False,
 'extensions.zotero.automaticScraperUpdates':False,'extensions.zotero.sync.autoSync':False,
 'app.update.enabled':False,'app.update.auto':False,'extensions.update.enabled':False,
 'toolkit.telemetry.enabled':False,'browser.shell.checkDefaultBrowser':False,
 'extensions.zotero.debug.log':True,'extensions.zotero.debug.store':True,
 'extensions.logging.enabled':True,'browser.dom.window.dump.enabled':True,
}
(profile/'user.js').write_text('\n'.join(f'user_pref({json.dumps(k)}, {json.dumps(v)});' for k,v in prefs.items()),encoding='utf-8')
# Minimal valid one-page PDF, generated locally without third-party assets.
stream=b'BT /F1 14 Tf 40 760 Td (Fixture paper: local extraction test.) Tj ET'
objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
pdf=bytearray(b'%PDF-1.4\n');offsets=[0]
for i,obj in enumerate(objects,1): offsets.append(len(pdf));pdf.extend(f'{i} 0 obj\n'.encode()+obj+b'\nendobj\n')
xref=len(pdf);pdf.extend(f'xref\n0 {len(objects)+1}\n0000000000 65535 f \n'.encode())
for offset in offsets[1:]:pdf.extend(f'{offset:010d} 00000 n \n'.encode())
pdf.extend(f'trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode())
(results/'fixture.pdf').write_bytes(pdf)
print(profile)
