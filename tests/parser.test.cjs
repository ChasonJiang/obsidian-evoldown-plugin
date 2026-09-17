const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {parseHeading,parseDocument,resolveReference} = require('../src/parser');
test('user example: six cards and all five references resolve',()=>{
 const {blocks} = parseDocument(readFileSync('README.md','utf8').match(/```markdown\n([\s\S]*?)```/)[1]);
 assert.equal(blocks.length,6); assert.deepEqual(blocks.map(x=>x.type),['d','e','d','t','v','c']);
 assert.equal(blocks[5].label,'自定义标签');
 for(const b of blocks.filter(x=>x.reference)) assert.ok(resolveReference(blocks,b.reference));
});
test('quoted titles, labels, escaped quotes and optional references',()=>{
 assert.deepEqual(parseHeading('#c "custom label" "my title" "other title"'),{type:'c',label:'custom label',title:'my title',reference:'other title'});
 assert.equal(parseHeading('#d "a \\"quote\\""').title,'a "quote"');
 assert.equal(parseHeading('#v 验证').reference,'');
});
test('invalid syntax and ordinary headings stay intact',()=>{
 for(const line of ['#x title','#c label','#d','#d a b c','#d "unfinished','\\#d title','    #d code','# 描述','## title','#d ""','#d "a"b']) assert.equal(parseHeading(line),null,line);
});
test('frontmatter, fences, indented code, comments, blockquotes and HTML are excluded',()=>{
 const source = ['---','#d yaml','---','```md','#d code','```','~~~~','#e code','~~~','#t still-code','~~~~','    #d indent','> #d quote','<!--','#d comment','-->','%%','#d comment','%%','<div>','#d html','</div>','','#d real','body'].join('\n');
 assert.deepEqual(parseDocument(source).blocks.map(x=>x.title),['real']);
});
test('body spans blank lines, ends at standard headings, handles CRLF and adjacent headings',()=>{
 const {blocks,lines} = parseDocument('#d a\r\nfirst\r\n\r\nsecond\r\n\r\n## native\r\noutside\r\n#e b a\r\n#v c b');
 assert.equal(lines.slice(blocks[0].start+1,blocks[0].end).join('\n'),'first\n\nsecond');
 assert.equal(blocks[1].end,8);assert.equal(blocks[2].end,9);
});
test('forward, duplicate and missing references are deterministic',()=>{
 const {blocks} = parseDocument('#e e later\n#d later\n#v later');
 assert.equal(resolveReference(blocks,'later').start,1);assert.equal(resolveReference(blocks,'missing'),undefined);
});
