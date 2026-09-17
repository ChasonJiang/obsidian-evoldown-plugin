'use strict';
const {parseDocument} = require('./parser');
const {createHeader} = require('./header');
let renderId = 0;
function preparePrintSource(source) {
  const {blocks} = parseDocument(source);
  const lines = source.split(/\r?\n/);
  const marker = 'evoldown-print-' + (++renderId);
  // Render the whole document in one pass so footnotes, reference-style links,
  // lists, tables and embeds retain their normal Markdown context.
  blocks.forEach((block,index) => {
    lines[block.start] = `\n<div data-${marker}="${index}"></div>\n`;
  });
  return {source:lines.join('\n'),blocks,marker};
}
async function renderPdfExport(plugin, element, context, renderer, RenderChild) {
  // Native PDF export supplies no section information. Only handle its full-note
  // root; ordinary MarkdownRenderer calls and partial embeds must stay untouched.
  if (!element.matches('.markdown-preview-view') || !element.parentElement?.classList.contains('print')) return false;
  const file = plugin.app.vault.getFileByPath(context.sourcePath);
  if (!file) return false;
  const prepared = preparePrintSource(await plugin.app.vault.cachedRead(file));
  if (!prepared.blocks.length) return false;
  const container = element.ownerDocument.createElement('div');
  container.dataset.evoldownRender = 'true';
  const child = new RenderChild(container); context.addChild(child);
  await renderer.render(plugin.app,prepared.source,container,context.sourcePath,child);
  const placeholders = container.querySelectorAll(`[data-${prepared.marker}]`);
  if (placeholders.length !== prepared.blocks.length) throw new Error('Evoldown: PDF heading placeholders were not preserved by the Markdown renderer.');
  for (const placeholder of placeholders) {
    const index = Number(placeholder.getAttribute('data-' + prepared.marker));
    const block = prepared.blocks[index];
    const header = createHeader(element.ownerDocument,block,prepared.blocks,()=>{},plugin.settings.headingLevel);
    header.classList.add('evoldown-print-heading');
    placeholder.replaceWith(header);
  }
  // With "Include file name" enabled, Obsidian inserts a direct H1 before the
  // wrapped note contents. Keep that exact element without duplicating it.
  const filename = element.firstElementChild?.tagName === 'H1' ? element.firstElementChild : null;
  element.replaceChildren(...(filename ? [filename,container] : [container]));
  return true;
}
module.exports = {preparePrintSource,renderPdfExport};
