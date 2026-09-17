const {test} = require('node:test');
const assert = require('node:assert/strict');
const {preparePrintSource,renderPdfExport} = require('../src/pdf-export');
test('print preparation replaces only real headings, retains full-document Markdown',()=>{
 const source='---\ntitle: 测试\n---\n# 普通标题\n\n#d 描述\n正文[^1]\n\n#c "自定义 标签" "我的 标题" 描述\n\n[链接][ref]\n\n```md\n#d 代码示例\n```\n\n[^1]: 脚注内容\n[ref]: https://example.com\n';
 const result=preparePrintSource(source);
 assert.deepEqual(result.blocks.map(x=>x.title),['描述','我的 标题']);
 assert.equal((result.source.match(new RegExp('data-'+result.marker,'g'))||[]).length,2);
 for(const preserved of ['---\ntitle: 测试\n---','# 普通标题','正文[^1]','```md\n#d 代码示例\n```','[^1]: 脚注内容','[ref]: https://example.com'])assert.ok(result.source.includes(preserved));
 assert.ok(!result.source.includes('#c "自定义 标签"'));
});
test('print placeholder markers are unique across documents',()=>{
 assert.notEqual(preparePrintSource('#d A').marker,preparePrintSource('#d B').marker);
});
test('generic renders and embedded note fragments do not trigger full-note replacement',async()=>{
 const plugin={app:{vault:{getFileByPath(){throw Error('Should not read unrelated content');}}}};
 assert.equal(await renderPdfExport(plugin,{matches:()=>false},{},null,null),false);
 assert.equal(await renderPdfExport(plugin,{matches:()=>true,parentElement:{classList:{contains:()=>false}}},{},null,null),false);
});
test('missing files and notes without Evoldown keep original export DOM',async()=>{
 const element={matches:()=>true,parentElement:{classList:{contains:()=>true}}};
 for(const file of [null,{}]){
  const plugin={app:{vault:{getFileByPath:()=>file,cachedRead:async()=>'# 普通标题\n\n正文'}}};
  assert.equal(await renderPdfExport(plugin,element,{sourcePath:'note.md'},null,null),false);
 }
});
