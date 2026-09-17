const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {parseDocument} = require('../src/parser');
// Small bubbling DOM double; exercise the actual widget and header handlers together.
class Element {
 constructor(){this.children=[];this.dataset={};this.events={};this.classList={add:()=>{}};}
 setAttribute(){}
 append(child){this.children.push(child);child.parent=this;}
 addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
 querySelector(selector){for(const child of this.children){if(child.className===selector.slice(1))return child;const result=child.querySelector(selector);if(result)return result;}return null;}
 emit(name,properties={}){
  const event={button:0,...properties,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
  for(let node=this;node;node=node.parent){for(const fn of node.events[name]??[])fn(event);if(event.stopped)break;}
  return event;
 }
}
const doc={createElement:()=>new Element(),createElementNS:()=>new Element()};
const sandbox={module:{exports:{}},require:id=>{
 if(id==='obsidian')return {Plugin:class{},PluginSettingTab:class{}};
 if(id==='@codemirror/state')return {StateEffect:{define:()=>({})}};
 if(id==='@codemirror/view')return {WidgetType:class{},EditorView:{scrollIntoView:position=>({position})}};
 return require('../src/'+id.replace('./',''));
}};
vm.runInNewContext(fs.readFileSync('src/main.js','utf8')+'\nmodule.exports = HeadingWidget;',sandbox);
function widget(source,index=1){
 const {blocks,lines}=parseDocument(source);let changes=[],focused=false;
 const view={dom:{ownerDocument:doc},state:{doc:{line:number=>({text:lines[number-1],from:lines.slice(0,number-1).reduce((n,line)=>n+line.length+1,0)})}},dispatch:change=>changes.push(change),focus:()=>focused=true};
 return {header:new sandbox.module.exports(blocks[index],blocks,2).toDOM(view),changes,focused:()=>focused};
}
test('single click places caret at current title, not after reference',()=>{
 const source='#d 目标\n正文\n#e 当前标题 目标';const h=widget(source);
 assert.ok(h.header.querySelector('.evoldown-title').emit('mousedown').prevented);
 h.header.querySelector('.evoldown-title').emit('click');
 assert.equal(h.changes.length,1);assert.equal(h.changes[0].selection.anchor,source.indexOf('当前标题'));assert.ok(h.focused());
});
test('custom label and quoted title are skipped correctly; keyboard edits too',()=>{
 const source='#d 目标\n#c "自定义 标签" "当前 标题" 目标';
 for(const event of ['click','keydown']){const h=widget(source);h.header.querySelector('.evoldown-title').emit(event,{key:'Enter'});assert.equal(h.changes[0].selection.anchor,source.indexOf('当前 标题'));}
});
test('reference text and icon click only navigate to target',()=>{
 for(const childIndex of [0,1]){
  const h=widget('#d 目标\n#e 当前标题 目标');
  h.header.querySelector('.evoldown-reference').children[childIndex].emit('click');
  assert.equal(h.changes.length,1);assert.equal(h.changes[0].selection.anchor,0);assert.ok(h.changes[0].effects);
 }
});
test('unresolved reference does not trigger title editing',()=>{
 const h=widget('#d 目标\n#e 当前标题 不存在');h.header.querySelector('.evoldown-reference').emit('click');assert.equal(h.changes.length,0);
});
test('custom label click and keyboard activation edit the label field',()=>{
 const source='#d 目标\n#c "自定义 标签" "当前 标题" 目标';
 for(const event of ['click','keydown']){const h=widget(source);h.header.querySelector('.evoldown-label').emit(event,{key:'Enter'});assert.equal(h.changes[0].selection.anchor,source.indexOf('自定义 标签'));}
});
test('type badge and its SVG click place caret after the type letter, not at the reference',()=>{
 for(const syntax of ['#e 当前标题 目标','  #c 标签 当前标题 目标']){
  for(const svg of [false,true]){
   const source='#d 目标\n'+syntax;const h=widget(source);const badge=h.header.children[0];
   (svg?badge.children[0]:badge).emit('click');
   assert.equal(h.changes.length,1);assert.equal(h.changes[0].selection.anchor,source.lastIndexOf('#')+2);
  }
 }
});
