'use strict';
const {Plugin, MarkdownRenderer, MarkdownRenderChild, MarkdownView, editorLivePreviewField, PluginSettingTab, Setting} = require('obsidian');
const {StateField, StateEffect} = require('@codemirror/state');
const {Decoration, EditorView, WidgetType, ViewPlugin} = require('@codemirror/view');
const {parseDocument} = require('./parser');
const {createHeader} = require('./header');
const {sourceFieldOffset, clickedTextOffset} = require('./editing');
const {renderPdfExport} = require('./pdf-export');
const {OutlineBridge} = require('./outline');
const refreshHeadings = StateEffect.define();
function headingLevel(value) { return Number.isInteger(value) && value >= 1 && value <= 6 ? value : 6; }
class EvoldownSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName('标题级别')
      .setDesc('所有自定义标题使用此级别的主题样式，修改后立即生效。')
      .addDropdown(dropdown => {
        for (let level = 1; level <= 6; level++) dropdown.addOption(String(level), `H${level}（${level} 级标题）`);
        dropdown.setValue(String(this.plugin.settings.headingLevel))
          .onChange(async value => { await this.plugin.setHeadingLevel(Number(value)); });
      });
  }
}
class HeadingWidget extends WidgetType {
  constructor(block, blocks, level) { super(); this.block = block; this.blocks = blocks; this.level = level; }
  eq(other) { return JSON.stringify([this.block,this.blocks,this.level]) === JSON.stringify([other.block,other.blocks,other.level]); }
  toDOM(view) {
    const header = createHeader(view.dom.ownerDocument, this.block, this.blocks, target => {
      const position = view.state.doc.line(target.start + 1).from;
      view.dispatch({selection:{anchor:position}, effects:EditorView.scrollIntoView(position,{y:'center'})}); view.focus();
    }, this.level, true);
    const enableEditing = (element, fieldIndex, name) => {
      element.classList.add('evoldown-editable-title');
      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
      element.setAttribute('aria-label', '编辑' + name + '：' + element.textContent);
      element.setAttribute('title', '单击编辑' + name);
      element.addEventListener('mousedown', event => {
        if (event.button === 0) event.preventDefault();
      });
      const edit = event => {
        event.preventDefault();
        event.stopPropagation();
        const offset = fieldIndex === null ? 0 : clickedTextOffset(element, event);
        const line = view.state.doc.line(this.block.start + 1);
        const sourceOffset = fieldIndex === null ? line.text.indexOf('#') + 2 : sourceFieldOffset(line.text,fieldIndex,offset);
        view.dispatch({selection:{anchor:line.from + sourceOffset}});
        view.focus();
      };
      element.addEventListener('click', edit);
      element.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') edit(event);
      });
    };
    const typeIcon = header.children[0];
    typeIcon.setAttribute('aria-hidden', 'false');
    enableEditing(typeIcon, null, '标题类型 #' + this.block.type);
    enableEditing(header.querySelector('.evoldown-title'), this.block.type === 'c' ? 1 : 0, '标题');
    const label = header.querySelector('.evoldown-label');
    if (label) enableEditing(label, 0, '自定义标签');
    return header;
  }
  ignoreEvent() { return true; }
}
function decorations(state, level) {
  if (!state.field(editorLivePreviewField, false)) return Decoration.none;
  const {blocks} = parseDocument(state.doc.toString());
  const ranges = [];
  for (const block of blocks) {
    const line = state.doc.line(block.start+1);
    ranges.push(Decoration.line({class:`HyperMD-header HyperMD-header-${level} evoldown-editor-heading`}).range(line.from));
    const editing = state.selection.ranges.some(range => range.from <= line.to && range.to >= line.from);
    if (!editing) ranges.push(Decoration.replace({widget:new HeadingWidget(block,blocks,level)}).range(line.from,line.to));
  }
  return Decoration.set(ranges,true);
}
module.exports = class EvoldownPlugin extends Plugin {
  async onload() {
    this.settings = {headingLevel: headingLevel((await this.loadData())?.headingLevel)};
    this.outline = new OutlineBridge(this);
    this.outline.start();
    this.editorViews = new Set();
    this.addSettingTab(new EvoldownSettingTab(this.app, this));
    const plugin = this;
    this.registerEditorExtension([
      ViewPlugin.fromClass(class {
        constructor(view) { this.view = view; plugin.editorViews.add(view); }
        destroy() { plugin.editorViews.delete(this.view); }
      }),
      StateField.define({
        create:state => decorations(state, plugin.settings.headingLevel),
        update(value, transaction) {
          return transaction.docChanged || transaction.selection || transaction.effects.some(effect => effect.is(refreshHeadings)) || transaction.startState.field(editorLivePreviewField,false) !== transaction.state.field(editorLivePreviewField,false)
            ? decorations(transaction.state, plugin.settings.headingLevel) : value;
        },
        provide:field => EditorView.decorations.from(field)
      })
    ]);
    this.registerMarkdownPostProcessor(async (element, context) => {
      if (element.closest('[data-evoldown-render]')) return;
      const info = context.getSectionInfo(element);
      if (!info) {
        await renderPdfExport(this,element,context,MarkdownRenderer,MarkdownRenderChild);
        return;
      }
      const parsed = parseDocument(info.text);
      const first = info.lineStart, last = info.lineEnd + 1;
      const blocks = parsed.blocks.filter(block => block.start < last && block.end > first);
      if (!blocks.length) return;
      const container = element.ownerDocument.createElement('div'); container.dataset.evoldownRender = 'true';
      const child = new MarkdownRenderChild(container); context.addChild(child);
      const render = async (start, end, parent) => {
        const markdown = parsed.lines.slice(start,end).join('\n');
        if (markdown.trim()) await MarkdownRenderer.render(this.app, markdown, parent, context.sourcePath, child);
      };
      let cursor = first;
      for (const block of blocks) {
        if (cursor < block.start) await render(cursor,block.start,container);
        const card = container.createDiv({cls:'evoldown-card'});
        card.dataset.evoldownLine = String(block.start);
        if (block.start < first) card.classList.add('evoldown-continuation');
        if (block.end > last) card.classList.add('evoldown-continues');
        if (block.start >= first) card.append(createHeader(element.ownerDocument,block,parsed.blocks,target => { void this.navigate(context.sourcePath,target,element); }, this.settings.headingLevel));
        await render(Math.max(first,block.start+1),Math.min(last,block.end),card.createDiv({cls:'evoldown-body'}));
        cursor = Math.min(last,block.end);
      }
      if (cursor < last) await render(cursor,last,container);
      element.replaceChildren(container);
    });
  }
  async setHeadingLevel(value) {
    this.settings.headingLevel = headingLevel(value);
    this.outline.refresh();
    for (const view of this.editorViews) view.dispatch({effects:refreshHeadings.of(null)});
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      if (leaf.view instanceof MarkdownView) leaf.view.previewMode.rerender(true);
    }
    await this.saveData(this.settings);
  }
  async navigate(path, target, element) {
    const root = element.closest('.markdown-preview-view');
    const card = root?.querySelector('[data-evoldown-line="' + target.start + '"]:not(.evoldown-continuation)');
    if (card) { card.scrollIntoView({block:'center',behavior:'smooth'}); card.classList.remove('evoldown-highlight'); void card.offsetWidth; card.classList.add('evoldown-highlight'); return; }
    const file = this.app.vault.getFileByPath(path);
    if (!file) return;
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file,{state:{mode:'source'}, eState:{line:target.start}});
    if (leaf.view instanceof MarkdownView) { leaf.view.editor.setCursor({line:target.start,ch:0}); leaf.view.editor.scrollIntoView({from:{line:target.start,ch:0},to:{line:target.start,ch:0}},true); }
  }
};
