'use strict';
const TYPES = new Set(['d', 'e', 't', 'v', 'c']);
// Quoted fields allow spaces; malformed syntax remains ordinary Markdown.
function parseHeading(line) {
  const match = /^ {0,3}#([a-z])\s+(.+?)\s*$/.exec(line);
  if (!match || !TYPES.has(match[1])) return null;
  const fields = [];
  const expression = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/gy;
  let position = 0;
  while (position < match[2].length) {
    expression.lastIndex = position;
    const token = expression.exec(match[2]);
    if (!token) return null;
    if (token[3] && /^["']/.test(token[3])) return null;
    fields.push((token[1] ?? token[2] ?? token[3]).replace(/\\([\\"'])/g, '$1'));
    position = expression.lastIndex;
    if (position < match[2].length && !/\s/.test(match[2][position])) return null;
    while (/\s/.test(match[2][position] ?? '') && position < match[2].length) position++;
  }
  const custom = match[1] === 'c';
  if (fields.some(x => !x) || fields.length < (custom ? 2 : 1) || fields.length > (custom ? 3 : 2)) return null;
  return { type: match[1], label: custom ? fields[0] : '', title: fields[custom ? 1 : 0], reference: fields[custom ? 2 : 1] || '' };
}
function parseDocument(source) {
  const lines = source.split(/\r?\n/);
  const blocks = [];
  let current = null, fence = null, frontmatter = lines[0] === '---', comment = false, html = false;
  const close = end => { if (current) { current.end = end; while (current.end > current.start + 1 && !lines[current.end - 1].trim()) current.end--; blocks.push(current); current = null; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (frontmatter) { if (i > 0 && /^(---|\.\.\.)\s*$/.test(line)) frontmatter = false; continue; }
    if (fence) { if (new RegExp('^ {0,3}' + fence.char + '{' + fence.size + ',}\\s*$').test(line)) fence = null; continue; }
    if (comment) { if (line.includes('-->') || line.includes('%%')) comment = false; continue; }
    if (html) { if (!line.trim()) html = false; continue; }
    if (/^ {0,3}(<!--|%%)/.test(line)) { comment = !/<!--.*-->|%%.*%%/.test(line); continue; }
    if (/^ {0,3}<\/?[a-zA-Z][\s>]/.test(line) || /^ {0,3}<(div|section|table|pre|script|style)\b/i.test(line)) { html = true; continue; }
    const f = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (f && !(f[1][0] === '`' && f[2].includes('`'))) { fence = {char:f[1][0],size:f[1].length}; continue; }
    const heading = parseHeading(line);
    if (heading) { close(i); current = {...heading, start:i, end:lines.length}; }
    else if (/^ {0,3}#{1,6}(?:\s|$)/.test(line)) close(i);
    else if (i > 0 && /^ {0,3}(?:=+|-+)\s*$/.test(line) && lines[i-1].trim()) close(i-1);
  }
  close(lines.length);
  return {lines, blocks};
}
function resolveReference(blocks, title) { return blocks.find(block => block.title === title); }
module.exports = {parseHeading, parseDocument, resolveReference};
