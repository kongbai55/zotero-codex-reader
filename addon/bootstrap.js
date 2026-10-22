/* MIT License */
var chromeHandle;
var codexScope;
const PLUGIN_ID = 'codex-reader@kongbai55.local';
function install() {}
function uninstall() {}
async function startup({rootURI}) {
  await Zotero.initializationPromise;
  // Zotero requires an HTTPS update URL. Disable background updates for this addon only.
  const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const addon=await AddonManager.getAddonByID(PLUGIN_ID);
  if (addon) addon.applyBackgroundUpdates=AddonManager.AUTOUPDATE_DISABLE;
  const aom = Components.classes['@mozilla.org/addons/addon-manager-startup;1'].getService(Components.interfaces.amIAddonManagerStartup);
  chromeHandle = aom.registerChrome(Services.io.newURI(rootURI+'manifest.json'),[
    ['content','codexreader',rootURI+'content/'],
    ['locale','codexreader','en-US',rootURI+'locale/en-US/'],
    ['locale','codexreader','zh-CN',rootURI+'locale/zh-CN/']
  ]);
  codexScope = {Zotero,Services,ChromeUtils,Components,IOUtils,PathUtils,URL,setTimeout,clearTimeout};
  for (const file of ['core.js','host.js','sidebar.js']) Services.scriptloader.loadSubScript(rootURI+'content/'+file,codexScope,'UTF-8');
  codexScope.CodexReaderHost.rootURI=rootURI;
  for (const win of Zotero.getMainWindows()) await onMainWindowLoad({window:win});
  codexScope.CodexReaderUI.install(rootURI,PLUGIN_ID);
}
function onMainWindowLoad({window}) {
  if (window.MozXULElement?.insertFTLIfNeeded) {
    window.MozXULElement.insertFTLIfNeeded('codex-reader.ftl');
    return;
  }
  if (!window.document.querySelector('link[href="codex-reader.ftl"]')) {
    const link=window.document.createElementNS('http://www.w3.org/1999/xhtml','link');
    link.rel='localization';link.href='codex-reader.ftl';window.document.documentElement.append(link);
  }
}
function onMainWindowUnload() {}
async function shutdown() {
  if (codexScope) {
    codexScope.CodexReaderUI.uninstall();await codexScope.CodexReaderHost.disconnect();
  }
  for (const win of Zotero.getMainWindows()) win.document.querySelector('link[href="codex-reader.ftl"]')?.remove();
  chromeHandle?.destruct();chromeHandle=null;codexScope=null;
}
