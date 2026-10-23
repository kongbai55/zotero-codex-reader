const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function fixture(){
  const prefs=new Map(),reads=[],timers=[];let text='{}';
  const scope={Zotero:{isWin:true},Services:{prefs:{getStringPref:(k,d)=>prefs.get(k)||d,setStringPref:(k,v)=>prefs.set(k,v)}},
    PathUtils:{join:(...p)=>p.join('/'),isAbsolute:p=>/^[a-z]:[\\/]/i.test(p),filename:p=>p.split(/[\\/]/).at(-1)},
    ChromeUtils:{importESModule:()=>({Subprocess:{getEnvironment:()=>({USERPROFILE:'C:/User'})}})},
    IOUtils:{readUTF8:async p=>{reads.push(p);return text;}},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{}};
  vm.createContext(scope);vm.runInContext(fs.readFileSync(require.resolve('../addon/content/projects.js'),'utf8'),scope);
  return {projects:scope.CodexReaderProjects,prefs,reads,timers,setState:value=>{text=typeof value==='string'?value:JSON.stringify(value);}};
}
const state=(name='研究项目',root='D:/Research')=>({'local-projects':{one:{id:'one',name,rootPaths:[root,'D:/Documents']}}});

test('sync reads only the desktop registry, with project name, primary/secondary roots and identity',async()=>{
  const f=fixture();f.setState(state());await f.projects.sync();const p=f.projects.load().projects[0];
  assert.equal(p.name,'研究项目');assert.equal(p.path,'D:/Research');assert.equal(p.roots.length,2);assert.equal(p.id,'one');
  assert.deepEqual(f.reads,['C:/User/.codex/.codex-global-state.json']);
});
test('Codex rename and root changes follow stable identity, preserving paper binding and manual projects',async()=>{
  const f=fixture();f.projects.save({projects:[{name:'old manual',path:'d:\\research'},{name:'Other',path:'D:/Other'}],bindings:{paper:'d:\\research'}});
  f.setState(state());await f.projects.sync();assert.equal(f.projects.load().bindings.paper,'one');
  f.setState(state('Renamed','D:/New'));await f.projects.sync();assert.equal(f.projects.current('paper').name,'Renamed');assert.equal(f.projects.current('paper').path,'D:/New');
  assert.equal(f.projects.load().projects.length,2);assert.ok(f.projects.load().projects.some(p=>p.path==='D:/Other'));
});
test('removed projects disappear unless bound; bound removals stay marked unavailable and cannot be selected',async()=>{
  const f=fixture();f.setState(state());await f.projects.sync();f.projects.bind('paper','one');
  f.setState({'local-projects':{}});await f.projects.sync();assert.equal(f.projects.current('paper').missing,true);assert.throws(()=>f.projects.bind('other','one'),/移除/);
  f.projects.bind('paper','');await f.projects.sync();assert.equal(f.projects.load().projects.length,0);
});
test('malformed or unsupported registry preserves the previous project list and reports failure',async()=>{
  const f=fixture();f.setState(state());await f.projects.sync();const saved=f.prefs.get(f.projects.pref);
  for(const bad of ['{bad',{}, {'local-projects':{one:{name:'bad',rootPaths:['relative']}}}]){
    f.setState(bad);await assert.rejects(f.projects.sync());assert.equal(f.prefs.get(f.projects.pref),saved);assert.match(f.projects.status,/同步未完成/);
  }
});
test('migrated aliases deduplicate by normalized path and retired projects stay hidden',()=>{
  const f=fixture();const snapshot=f.projects.snapshot({'local-projects':{
    'g-p-one':{id:'g-p-one',name:'old',rootPaths:['D:/Research']},
    one:{id:'one',name:'current',rootPaths:['d:\\research']},retired:{name:'removed',rootPaths:['D:/Old'],retiredChatGptBacking:{}}
  }});assert.equal(snapshot.length,1);assert.equal(snapshot[0].name,'current');
});
test('custom CODEX_HOME and legacy saved roots are supported without touching authentication',async()=>{
  const f=fixture();f.prefs.set('extensions.codexreader.home','D:/Custom');f.setState({'electron-saved-workspace-roots':['D:/Old'],'electron-workspace-root-labels':{'D:/Old':'Legacy'}});
  await f.projects.sync();assert.deepEqual(f.reads,['D:/Custom/.codex-global-state.json']);assert.equal(f.projects.load().projects[0].name,'Legacy');
});
test('watch starts immediately, schedules refresh after completion and stops on uninstall',async()=>{
  const f=fixture();f.setState(state());let events=0;const listener=()=>events++;
  f.projects.start(listener);await f.projects.sync();await new Promise(resolve=>setImmediate(resolve));assert.equal(events,1);assert.equal(f.timers.length,1);
  f.setState(state('Updated'));await f.timers[0]();assert.equal(events,2);assert.equal(f.projects.load().projects[0].name,'Updated');
  f.projects.stop(listener);assert.equal(f.projects.running,false);assert.equal(f.projects.timer,null);
});
