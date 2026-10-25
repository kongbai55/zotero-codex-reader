const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

function fixture(onConfirm){
  const scope={};vm.createContext(scope);
  vm.runInContext(fs.readFileSync('addon/content/sidebar.js','utf8'),scope);
  const root=new EventTarget(),editor=new EventTarget();
  editor.setAttribute=()=>{};editor.closest=()=>editor;
  scope.CodexReaderUI.protectCommentEditor(editor,{windowRoot:root},onConfirm);
  const key=(props={})=>{
    const event=new Event('keydown',{cancelable:true});
    Object.assign(event,{key:'Enter',originalTarget:editor,...props});root.dispatchEvent(event);return event;
  };
  return {root,editor,key};
}

test('paper comment Enter confirms once, Shift+Enter keeps native editing and repeat does not confirm',()=>{
  let confirmations=0,leaked=0;
  const {root,key}=fixture(()=>confirmations++);
  root.addEventListener('keydown',()=>leaked++);
  assert.equal(key({shiftKey:true}).defaultPrevented,false);assert.equal(confirmations,0);
  assert.equal(key({repeat:true}).defaultPrevented,true);assert.equal(confirmations,0);
  assert.equal(key().defaultPrevented,true);assert.equal(confirmations,1);
  assert.equal(key({key:'Backspace'}).defaultPrevented,false);
  assert.equal(key({key:'ArrowLeft'}).defaultPrevented,false);assert.equal(leaked,0);
  key({key:'Escape'});key({key:'Tab'});assert.equal(leaked,2);
});

test('IME confirmation and comments without an explicit submit action keep native Enter behavior',()=>{
  let confirmations=0;
  const {editor,key}=fixture(()=>confirmations++);
  for(const props of [{isComposing:true},{keyCode:229},{ctrlKey:true},{altKey:true},{metaKey:true}])assert.equal(key(props).defaultPrevented,false);
  editor.dispatchEvent(new Event('compositionstart'));
  assert.equal(key().defaultPrevented,false);assert.equal(confirmations,0);
  editor.dispatchEvent(new Event('compositionend'));
  assert.equal(key().defaultPrevented,true);assert.equal(confirmations,1);
  assert.equal(fixture().key().defaultPrevented,false);
});
