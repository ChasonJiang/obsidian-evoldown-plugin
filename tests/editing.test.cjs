const {test} = require('node:test');
const assert = require('node:assert/strict');
const {sourceFieldOffset,clickedTextOffset} = require('../src/editing');
test('clicked offsets map into title and custom label, including quoted and escaped text',()=>{
 const line = '#c "我的 标签" "标题 \\"引用\\" 内容" 目标';
 assert.equal(sourceFieldOffset(line,0,3),line.indexOf('标签'));
 assert.equal(sourceFieldOffset(line,1,4),line.indexOf('引用'));
 assert.equal(sourceFieldOffset('#d 描述文字 引用',0,2),5);
 assert.equal(sourceFieldOffset('#d "😀标题"',0,2),6);
 assert.equal(sourceFieldOffset('#d 标题',0,100),5);
});
test('caret API measures the text offset inside the clicked field',()=>{
 const node={};const doc={caretPositionFromPoint:()=>({offsetNode:node,offset:3}),createRange:()=>({selectNodeContents(){},setEnd(n,offset){assert.equal(n,node);this.offset=offset;},toString(){return '标题字'.slice(0,this.offset);}})};
 assert.equal(clickedTextOffset({ownerDocument:doc,contains:n=>n===node},{clientX:20,clientY:10,detail:1}),3);
});
test('glyph fallback handles a wrapped line and text end',()=>{
 const node={nodeType:3,textContent:'标题文字'};
 const doc={createRange:()=>({setStart(n,i){this.index=i;},setEnd(){},getClientRects(){const i=this.index;return [{left:(i%2)*10,right:(i%2)*10+10,top:Math.floor(i/2)*20,bottom:Math.floor(i/2)*20+20}];}})};
 const element={ownerDocument:doc,firstChild:node};
 assert.equal(clickedTextOffset(element,{clientX:9,clientY:25,detail:1}),3);
 assert.equal(clickedTextOffset(element,{clientX:30,clientY:25,detail:1}),4);
 assert.equal(clickedTextOffset(element,{clientX:0,clientY:0,detail:0}),0);
});
