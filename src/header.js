'use strict';
const icons = require('./icons.json');
const {resolveReference} = require('./parser');
function icon(doc, type) {
  const badge = doc.createElement('span');
  badge.className = 'evoldown-icon evoldown-type-' + type;
  badge.setAttribute('aria-hidden', 'true');
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  for (const data of icons[type] || icons.c) {
    const path = doc.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', data); path.setAttribute('fill', 'currentColor'); svg.append(path);
  }
  badge.append(svg); return badge;
}
function createHeader(doc, block, blocks, navigate, level = 6, inline = false) {
  level = Number.isInteger(level) && level >= 1 && level <= 6 ? level : 6;
  const header = doc.createElement(inline ? 'span' : `h${level}`);
  header.className = 'evoldown-heading';
  header.dataset.level = String(level);
  if (!inline) header.setAttribute('data-heading', block.title);
  if (inline) { header.setAttribute('role', 'heading'); header.setAttribute('aria-level', String(level)); }
  header.append(icon(doc, block.type));
  if (block.label) { const label = doc.createElement('span'); label.className = 'evoldown-label'; label.textContent = block.label; header.append(label); }
  const title = doc.createElement('span'); title.className = 'evoldown-title'; title.textContent = block.title; header.append(title);
  if (block.reference) {
    const chain = doc.createElement('span'); chain.className = 'evoldown-chain'; chain.setAttribute('aria-hidden','true');
    const svg = doc.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 24 24');
    const path = doc.createElementNS(svg.namespaceURI,'path');
    path.setAttribute('d','M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2');
    path.setAttribute('fill','none'); path.setAttribute('stroke','currentColor'); path.setAttribute('stroke-width','2'); svg.append(path); chain.append(svg); header.append(chain);
    const target = resolveReference(blocks, block.reference);
    const ref = doc.createElement('button'); ref.type = 'button'; ref.className = 'evoldown-reference';
    ref.setAttribute('aria-label', '跳转到：' + block.reference);
    if (target) { ref.append(icon(doc, target.type)); ref.addEventListener('click', event => {event.preventDefault(); event.stopPropagation(); navigate(target);}); }
    else { ref.disabled = true; ref.classList.add('is-unresolved'); ref.title = '当前笔记中未找到此标题'; }
    const name = doc.createElement('span'); name.textContent = block.reference; ref.append(name); header.append(ref);
  }
  return header;
}
module.exports = {createHeader};
