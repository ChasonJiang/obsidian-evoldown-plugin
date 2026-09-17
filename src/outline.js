'use strict';
const {parseDocument} = require('./parser');
function outlineHeadings(source, level) {
  const {lines,blocks} = parseDocument(source);
  const offsets = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') offsets.push(i+1);
  return blocks.map(block => {
    const col = lines[block.start].indexOf('#');
    return {heading:block.title,level,position:{
      start:{line:block.start,col,offset:offsets[block.start]+col},
      end:{line:block.start,col:lines[block.start].length,offset:offsets[block.start]+lines[block.start].length}
    }};
  });
}
// Obsidian has no public heading-provider hook. Add reversible in-memory entries
// to the metadata consumed by the core Outline; never rewrite vault files.
class OutlineBridge {
  constructor(plugin) {
    this.plugin = plugin; this.app = plugin.app;
    this.records = new Map(); this.owned = new WeakSet(); this.revisions = new WeakMap();
    this.active = true; this.publishing = false;
  }
  start() {
    this.plugin.registerEvent(this.app.metadataCache.on('changed',(file,source,cache) => {
      if (!this.active || this.publishing || file.extension !== 'md') return;
      this.revisions.set(file,(this.revisions.get(file)||0)+1);
      this.apply(file,source,cache);
    }));
    this.plugin.registerEvent(this.app.vault.on('delete',file => {
      this.revisions.set(file,(this.revisions.get(file)||0)+1);
      const record = this.records.get(file);
      if (record) this.clean(record.cache);
      this.records.delete(file);
    }));
    this.plugin.registerEvent(this.app.workspace.on('file-open',file => { if (file?.extension === 'md') void this.read(file); }));
    this.plugin.register(() => this.stop());
    this.app.workspace.onLayoutReady(() => { void this.scan(); });
  }
  async scan() {
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!this.active) break;
      await this.read(file);
    }
  }
  async read(file) {
    if (!this.active) return;
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return; // The normal changed event handles newly indexed files.
    const revision = (this.revisions.get(file)||0)+1;
    this.revisions.set(file,revision);
    try {
      const source = await this.app.vault.cachedRead(file);
      if (this.active && this.revisions.get(file) === revision && this.app.metadataCache.getFileCache(file) === cache) this.apply(file,source,cache);
    } catch (error) { if (this.active) console.warn('Evoldown: unable to index outline for',file.path,error); }
  }
  clean(cache) {
    if (!cache.headings) return false;
    const original = cache.headings;
    const remaining = original.filter(heading => !this.owned.has(heading));
    if (remaining.length === original.length) return false;
    if (remaining.length) cache.headings = remaining;
    else delete cache.headings;
    return true;
  }
  apply(file,source,cache) {
    if (!this.active || typeof source !== 'string' || !cache) return;
    const previous = this.records.get(file);
    if (previous && previous.cache !== cache) this.clean(previous.cache);
    const removed = this.clean(cache);
    const custom = outlineHeadings(source,this.plugin.settings.headingLevel);
    for (const heading of custom) this.owned.add(heading);
    if (custom.length) {
      cache.headings = [...(cache.headings||[]),...custom].sort((a,b)=>a.position.start.offset-b.position.start.offset);
      this.records.set(file,{source,cache});
    } else this.records.delete(file);
    if (custom.length || removed) this.notify(file,source,cache);
  }
  notify(file,source,cache) {
    this.publishing = true;
    try { this.app.metadataCache.trigger('changed',file,source,cache); }
    finally { this.publishing = false; }
  }
  refresh() {
    for (const [file,record] of this.records) {
      if (this.app.metadataCache.getFileCache(file) === record.cache) this.apply(file,record.source,record.cache);
    }
  }
  stop() {
    this.active = false;
    for (const [file,record] of this.records) {
      if (this.clean(record.cache)) this.notify(file,record.source,record.cache);
    }
    this.records.clear();
  }
}
module.exports = {outlineHeadings,OutlineBridge};
