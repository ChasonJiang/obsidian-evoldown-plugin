'use strict';
// Translate the rendered character offset back through quotes and escape sequences.
function sourceFieldOffset(line, fieldIndex, displayOffset) {
  const prefix = /^ {0,3}#[a-z]\s+/.exec(line);
  if (!prefix) return 0;
  const fields = [...line.slice(prefix[0].length).matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+/g)];
  const field = fields[fieldIndex];
  if (!field) return prefix[0].length;
  const quoted = /^["']/.test(field[0]);
  const raw = quoted ? field[0].slice(1,-1) : field[0];
  let source = 0, displayed = 0;
  while (source < raw.length && displayed < displayOffset) {
    if (raw[source] === '\\' && /[\\"']/.test(raw[source+1] || '')) source++;
    source++; displayed++;
  }
  return prefix[0].length + field.index + (quoted ? 1 : 0) + source;
}
function clickedTextOffset(element, event) {
  if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY) || event.detail === 0) return 0;
  const doc = element.ownerDocument;
  const point = doc.caretPositionFromPoint?.(event.clientX,event.clientY);
  const caret = point ? {startContainer:point.offsetNode,startOffset:point.offset} : doc.caretRangeFromPoint?.(event.clientX,event.clientY);
  if (caret && element.contains(caret.startContainer)) {
    const range = doc.createRange();
    range.selectNodeContents(element); range.setEnd(caret.startContainer,caret.startOffset);
    return range.toString().length;
  }
  // Noneditable CodeMirror widgets can be excluded by browser caret hit testing.
  // These fields contain one plain text node: use its glyph rectangles as fallback.
  const text = element.firstChild;
  if (!text || text.nodeType !== 3) return 0;
  const range = doc.createRange();
  let best = 0, distance = Infinity, offset = 0;
  for (const character of text.textContent) {
    const end = offset + character.length;
    range.setStart(text,offset); range.setEnd(text,end);
    for (const rect of range.getClientRects()) {
      const dy = Math.max(rect.top-event.clientY,0,event.clientY-rect.bottom);
      for (const [x,index] of [[rect.left,offset],[rect.right,end]]) {
        const score = dy * 10000 + Math.abs(event.clientX-x);
        if (score < distance) {distance=score;best=index;}
      }
    }
    offset = end;
  }
  return best;
}
module.exports = {sourceFieldOffset,clickedTextOffset};
