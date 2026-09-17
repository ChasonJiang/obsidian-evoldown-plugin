const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {outlineHeadings,OutlineBridge} = require('../src/outline');
function events(){const listeners={};return {on(name,fn){(listeners[name]??=[]).push(fn);return {name,fn};},trigger(name,...args){for(const fn of listeners[name]??[])fn(...args);}};}
function harness(source,cache={}){
 const file={path:'example.md',extension:'md'};const metadata=events();let cleanup;
 const plugin={settings:{headingLevel:6},registerEvent(){},register(fn){cleanup=fn;},app:{
  metadataCache:Object.assign(metadata,{getFileCache:()=>cache}),
  vault:Object.assign(events(),{getMarkdownFiles:()=>[file],cachedRead:async()=>source}),
  workspace:Object.assign(events(),{onLayoutReady(){}})
 }};
 const bridge=new OutlineBridge(plugin);bridge.start();
 return {file,cache,bridge,plugin,cleanup:()=>cleanup()};
}
test('six example headings use title only and include exact jump positions',()=>{
 const source=readFileSync('README.md','utf8').match(/```markdown\n([\s\S]*?)```/)[1];const headings=outlineHeadings(source,6);
 assert.deepEqual(headings.map(h=>h.heading),['描述1','例子1','描述2','迁移1','验证','标题']);
 for(const h of headings){assert.equal(h.level,6);assert.equal(source[h.position.start.offset],'#');assert.equal(source.slice(h.position.start.offset,h.position.end.offset),source.split('\n')[h.position.start.line]);}
});
test('CRLF offsets, quoted names, duplicate names, and code exclusions',()=>{
 const source='#d "同名"\r\n```\r\n#e 忽略\r\n```\r\n  #c 标签 同名';const headings=outlineHeadings(source,3);
 assert.equal(headings.length,2);assert.equal(headings[1].heading,'同名');assert.equal(headings[1].position.start.offset,source.lastIndexOf('#'));assert.equal(headings[1].position.start.col,2);
});
test('merge preserves native entries, orders by source, never duplicates on reindex',()=>{
 const native={heading:'原生',level:1,position:{start:{offset:0,line:0,col:0}}};
 const source='# 原生\n#d 自定义';const h=harness(source,{headings:[native]});
 for(let i=0;i<3;i++)h.plugin.app.metadataCache.trigger('changed',h.file,source,h.cache);
 assert.deepEqual(h.cache.headings.map(x=>x.heading),['原生','自定义']);assert.equal(h.cache.headings[0],native);
});
test('edit, level change and deletion refresh the same cache without stale entries',()=>{
 const h=harness('#d 旧标题');h.bridge.apply(h.file,'#d 旧标题',h.cache);
 h.plugin.app.metadataCache.trigger('changed',h.file,'#v 新标题',h.cache);
 assert.deepEqual(h.cache.headings.map(x=>x.heading),['新标题']);
 h.plugin.settings.headingLevel=2;h.bridge.refresh();assert.equal(h.cache.headings[0].level,2);
 h.plugin.app.metadataCache.trigger('changed',h.file,'正文',h.cache);assert.equal(h.cache.headings,undefined);
});
test('startup indexes existing files and unload removes only our headings',async()=>{
 const native={heading:'Native',level:1,position:{start:{offset:0}}};const h=harness('# Native\n#d Custom',{headings:[native]});
 await h.bridge.scan();assert.equal(h.cache.headings.length,2);
 const other={heading:'Other plugin',level:2,position:{start:{offset:100}}};h.cache.headings.push(other);
 h.cleanup();assert.deepEqual(h.cache.headings,[native,other]);assert.equal(h.bridge.records.size,0);
});
test('in-flight startup read cannot overwrite a newer edit or reinsert after unload',async()=>{
 for(const unload of [false,true]){
  const h=harness('');let resolve;h.plugin.app.vault.cachedRead=()=>new Promise(r=>resolve=r);
  const pending=h.bridge.read(h.file);
  if(unload)h.cleanup();else h.plugin.app.metadataCache.trigger('changed',h.file,'#d 最新',h.cache);
  resolve('#d 过时');await pending;
  assert.deepEqual((h.cache.headings||[]).map(x=>x.heading),unload?[]:['最新']);
 }
});
test('renamed file retains indexing; deleted file is removed from level refresh',()=>{
 const h=harness('#d 标题');h.bridge.apply(h.file,'#d 标题',h.cache);h.file.path='renamed.md';
 h.plugin.settings.headingLevel=4;h.bridge.refresh();assert.equal(h.cache.headings[0].level,4);
 h.plugin.app.vault.trigger('delete',h.file);assert.equal(h.cache.headings,undefined);assert.equal(h.bridge.records.size,0);
});
