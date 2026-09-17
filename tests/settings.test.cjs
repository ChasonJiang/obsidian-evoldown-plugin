const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function harness(saved) {
 class MarkdownView { constructor() { this.previewMode = {rerender:()=>this.refreshed=true}; } }
 class Plugin {
  async loadData() { return saved; }
  async saveData(value) { this.saved = {...value}; }
  addSettingTab(tab) { this.tab = tab; }
  registerEditorExtension(extension) { this.extension = extension; }
  registerMarkdownPostProcessor(processor) { this.processor = processor; }
 }
 let control;
 class Setting {
  setName() {return this;} setDesc() {return this;}
  addDropdown(callback) { control = {options:[],addOption(value){this.options.push(value);return this;},setValue(value){this.value=value;return this;},onChange(fn){this.change=fn;return this;}}; callback(control);return this; }
 }
 const obsidian = {Plugin,MarkdownView,PluginSettingTab:class {constructor(){this.containerEl={empty(){}};}},Setting};
 const module = {exports:{}};
 vm.runInNewContext(fs.readFileSync('src/main.js','utf8'),{module,require:id=>{
  if(id==='./outline')return {OutlineBridge:class {start(){} refresh(){}}};
  if(id==='obsidian')return obsidian;
  if(id==='@codemirror/state')return {StateEffect:{define:()=>({of:value=>({value})})},StateField:{define:x=>x}};
  if(id==='@codemirror/view')return {WidgetType:class{},ViewPlugin:{fromClass:x=>x},EditorView:{decorations:{from:x=>x}}};
  return require('../src/'+id.replace('./',''));
 }});
 const plugin = new module.exports(); const view = new MarkdownView();
 plugin.app = {workspace:{getLeavesOfType:()=>[{view}]}};
 return {plugin,view,control:()=>control};
}
test('default H6; dropdown exposes H1–H6, saves and refreshes both views',async()=>{
 const h=harness(null);await h.plugin.onload();assert.equal(h.plugin.settings.headingLevel,6);
 h.plugin.tab.display();assert.equal(h.control().options.join(','),'1,2,3,4,5,6');
 let refreshed=false;h.plugin.editorViews.add({dispatch(){refreshed=true;}});
 await h.control().change('4');assert.equal(h.plugin.saved.headingLevel,4);assert.ok(refreshed);assert.ok(h.view.refreshed);
 const restored=harness(h.plugin.saved);await restored.plugin.onload();assert.equal(restored.plugin.settings.headingLevel,4);
});
test('invalid saved levels fall back to H6',async()=>{
 for(const level of [0,7,'3',null,2.5]){const h=harness({headingLevel:level});await h.plugin.onload();assert.equal(h.plugin.settings.headingLevel,6);}
});
