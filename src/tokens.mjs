// The inline editable command sentence.
//
//   download ⟨100⟩ ⟨minimal⟩ wallpapers from ⟨wallhaven⟩ as ⟨any⟩ into ⟨~/Downloads/wallgrab⟩
//
// ←/→ move between the ⟨tokens⟩ · ↑/↓ cycle values · type to filter/custom · ⏎ runs.
//
// The dir token additionally opens a folder browser (↓):
//   space enter folder · ⌫ parent · ⏎ select current · n new folder · ←/esc close
// and `e` toggles the config overlay.

import { c, CYAN, AMBER, width as sw } from './ansi.mjs';
import { SOURCES, byId, FORMATS } from './sources.mjs';
import { defaultDir, downloadsDir, mask, configPath } from './config.mjs';
import { readdir, mkdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, isAbsolute } from 'node:path';
import { homedir } from 'node:os';

export const MENU_H = 8;

const DIR_OPTIONS = () => [defaultDir(), downloadsDir(), join(homedir(), 'Pictures')];

/** Build the token list for a source, keeping values the user already set. */
export function buildTokens(sourceId, prev = {}) {
  const src = byId(sourceId);
  const tokens = [
    {
      key: 'count', label: 'download', value: prev.count ?? String(src?.defaults.count ?? 100),
      options: ['10', '25', '50', '100', '250', '500', '1000'],
      validate: (v) => (/^\d+$/.test(v) && +v > 0) ? null : 'needs a whole number',
    },
    {
      key: 'query', label: '', value: prev.query ?? src?.defaults.query ?? 'minimal',
      options: ['minimal', 'minimalism', 'abstract', 'geometric', 'gradient', 'dark',
        'nature', 'space', 'city', 'architecture', 'texture', 'vaporwave', 'topographic'],
      freeform: true, hint: 'search terms',
    },
    {
      key: 'source', label: 'wallpapers from', value: sourceId,
      options: null, sourceToken: true,
    },
    {
      key: 'format', label: 'as', value: prev.format ?? 'any',
      options: FORMATS, hint: 'kept files must really be this format',
    },
    {
      key: 'dir', label: 'into', value: prev.dir ?? defaultDir(),
      freeform: true, dirToken: true,
      hint: '↓ browse · type or paste a path',
    },
  ];

  for (const extra of src?.extra || []) {
    tokens.push({ ...extra, value: prev[extra.key] ?? extra.value, label: extra.label });
  }
  return tokens;
}

export class SentenceEditor {
  constructor(sourceId, initial = {}) {
    this.tokens = buildTokens(sourceId, initial);
    this.index = 0;
    this.typing = null;
    this.menuOffset = 0;
    this.error = null;

    // browser / overlay / key-input state
    this.mode = 'menu';          // 'menu' | 'browse'
    this.overlay = false;
    this.keyInput = null;        // { env, value } while pasting an API key
    this.browse = null;          // { path, entries, index, offset }
    this.naming = null;          // new-folder name being typed
    this.recentDirs = [];
  }

  get token() { return this.tokens[this.index]; }
  get values() { return Object.fromEntries(this.tokens.map((t) => [t.key, t.value])); }

  // ── options / validation ───────────────────────────────────────────────

  options() {
    const t = this.token;
    if (t.sourceToken) return SOURCES.map((s) => s.id);
    if (t.dirToken && this.mode !== 'browse') return DIR_OPTIONS();
    let opts = t.options ? [...t.options] : [];
    if (this.typing) {
      const q = this.typing.toLowerCase();
      opts = opts.filter((o) => o.toLowerCase().includes(q));
      if (t.freeform !== false && !opts.includes(this.typing)) opts = [this.typing, ...opts];
    }
    return opts;
  }

  // ── core token ops (unchanged behaviour) ──────────────────────────────

  move(delta) {
    const n = this.tokens.length;
    this.index = (this.index + delta + n) % n;
    this._leaveModes();
    if (this.token.sourceToken) this._noteSource = true;
  }

  cycle(delta) {
    if (this.mode === 'browse') return this.browseMove(delta);
    const opts = this.options();
    if (!opts.length) return;
    const cur = opts.indexOf(this.typing ?? this.token.value);
    const next = cur === -1 ? (delta > 0 ? 0 : opts.length - 1)
      : (cur + delta + opts.length) % opts.length;
    this.menuOffset = Math.max(0, next - (MENU_H - 2));
    this._apply(opts[next]);
  }

  _apply(value) {
    const t = this.token;
    if (t.validate) {
      const err = t.validate(value);
      if (err) { this.error = err; return; }
    }
    t.value = value;
    this.error = null;
    if (t.sourceToken) {
      const keep = this.values;
      this.tokens = buildTokens(value, keep);
      this.index = this.tokens.findIndex((x) => x.key === 'source');
    }
  }

  typeChar(ch) {
    if (this.naming !== null) { this.naming += ch; return; }
    if (this.mode === 'browse') this._leaveModes(); // typing = paste-a-path mode
    this.typing = (this.typing ?? '') + ch;
    this.menuOffset = 0;
    this._apply(this.typing);
  }

  backspace() {
    if (this.naming !== null) { this.naming = this.naming.slice(0, -1); return; }
    if (this.mode === 'browse') return this.browseBack();
    if (this.typing === null) return;
    this.typing = this.typing.slice(0, -1);
    this.menuOffset = 0;
    if (this.token.freeform) this._apply(this.typing);
  }

  cancelTyping() { this.typing = null; this.naming = null; this.error = null; this.menuOffset = 0; }

  _leaveModes() { this.mode = 'menu'; this.browse = null; this.naming = null; this.overlay = false; this.keyInput = null; }

  // ── masked API-key input ──────────────────────────────────────────────
  startKeyInput(env) {
    this.keyInput = { env, value: '' };
    this.typing = null; this.mode = 'menu'; this.overlay = false; this.error = null;
  }
  keyChar(ch) { if (this.keyInput) this.keyInput.value += ch; }
  keyBackspace() { if (this.keyInput) this.keyInput.value = this.keyInput.value.slice(0, -1); }
  keyCancel() { this.keyInput = null; }

  commitError() {
    for (const t of this.tokens) {
      if (t.validate) {
        const err = t.validate(t.value);
        if (err) return `${t.key}: ${err}`;
      }
      if (t.sourceToken && !SOURCES.some((s) => s.id === t.value)) {
        const near = SOURCES.filter((s) => s.id.startsWith(String(t.value)[0]));
        return `unknown source "${t.value}"` +
          (near.length ? ` — did you mean ${near.map((s) => s.id).join(' / ')}?`
                       : ` — try ${SOURCES.map((s) => s.id).join(', ')}`);
      }
    }
    return null;
  }

  // ── folder browser ────────────────────────────────────────────────────

  async openBrowse(startAt) {
    let base = startAt ?? this.token.value;
    base = resolve(base.startsWith('~') ? join(homedir(), base.slice(1)) : base);
    if (!existsSync(base) || !this._isDir(base)) base = dirname(base);
    if (!existsSync(base) || !this._isDir(base)) base = downloadsDir();
    await this._loadBrowse(base);
    this.mode = 'browse';
    this.typing = null;
    this.error = null;
  }

  _isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }

  async _loadBrowse(path) {
    let entries = [];
    try {
      const list = await readdir(path, { withFileTypes: true });
      entries = list
        .filter((e) => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    } catch (e) {
      this.error = `can't read ${path}: ${e.code || e.message}`;
    }
    this.browse = { path, entries, index: 0, offset: 0 };
    this.naming = null;
  }

  browseMove(delta) {
    const b = this.browse;
    if (!b || !b.entries.length) return;
    b.index = (b.index + delta + b.entries.length) % b.entries.length;
    b.offset = Math.min(Math.max(0, b.index - (MENU_H - 2)), Math.max(0, b.entries.length - MENU_H));
  }

  async browseEnter() { // space: descend into the highlighted folder
    const b = this.browse;
    if (!b?.entries.length) return;
    await this._loadBrowse(join(b.path, b.entries[b.index]));
  }

  async browseBack() { // ⌫: up one level
    const b = this.browse;
    if (!b) return;
    const parent = dirname(b.path);
    if (parent === b.path) return;
    const old = b.path.split(/[\\/]/).pop();
    await this._loadBrowse(parent);
    const i = this.browse.entries.indexOf(old);
    if (i >= 0) { this.browse.index = i; this.browse.offset = Math.max(0, i - (MENU_H - 2)); }
  }

  async browseNew() { // n then type a name, ⏎ creates it
    if (this.naming === null) { this.naming = ''; return; }
    const name = this.naming.trim();
    this.naming = null;
    if (!name) return;
    try {
      await mkdir(join(this.browse.path, name), { recursive: false });
      await this._loadBrowse(this.browse.path);
      const i = this.browse.entries.indexOf(name);
      if (i >= 0) this.browse.index = i;
    } catch (e) {
      this.error = e.code === 'EEXIST' ? `folder "${name}" already exists` : `${e.code || e.message}`;
    }
  }

  browseSelect() { // ⏎ in browse: take the current folder as the dir value
    if (!this.browse) return;
    this.token.value = this.browse.path;
    this.recentDirs = [this.browse.path, ...this.recentDirs.filter((d) => d !== this.browse.path)].slice(0, 5);
    this._leaveModes();
  }

  // ── overlay ───────────────────────────────────────────────────────────

  toggleOverlay(cfg) {
    this.overlay = !this.overlay;
    if (this.overlay) {
      const v = cfg?.values || {};
      const keys = cfg?.keys || {};
      this._overlayLines = [
        `${c.bold}saved preferences${c.reset}  ${c.dim}${configPath()}${c.reset}`,
        '',
        ...Object.entries(v).slice(0, 9).map(
          ([k, val]) => `  ${CYAN}${String(k).padEnd(10)}${c.reset} ${String(val)}`,
        ),
        '',
        `${c.bold}keys${c.reset} ${c.dim}(optional, stored locally)${c.reset}`,
        ...['UNSPLASH_ACCESS_KEY', 'PEXELS_API_KEY', 'PIXABAY_API_KEY'].map((k) =>
          `  ${k.padEnd(20)} ${keys[k] ? c.green + mask(keys[k]) + c.reset : c.dim + 'not set' + c.reset}`),
        '',
        `${c.dim}env vars always win · --reset clears · --no-save skips${c.reset}`,
      ];
    }
  }

  // ── rendering ─────────────────────────────────────────────────────────

  sentence() {
    let out = `${AMBER}${c.bold}download${c.reset} `;
    for (let i = 0; i < this.tokens.length; i++) {
      const t = this.tokens[i];
      if (i > 0 && t.label) out += `${c.dim}${t.label}${c.reset} `;
      const active = i === this.index;
      const val = String(t.value ?? '');
      out += active
        ? `${c.inverse}${CYAN}${c.bold} ${val || '…'} ${c.reset}`
        : `${CYAN}${val || c.dim + '…'}${c.reset}`;
      out += ' ';
    }
    return out;
  }

  _box(title, rows, foot) {
    const W = 60;
    const lines = [];
    lines.push(`  ${c.dim}┌ ${c.bold}${title}${c.reset}${c.dim} ${'─'.repeat(Math.max(2, W - sw(title)))}┐${c.reset}`);
    for (const r of rows) {
      lines.push(`  ${c.dim}│${c.reset}${padRow(r, W)}${c.dim}│${c.reset}`);
    }
    lines.push(`  ${c.dim}└${'─'.repeat(W)}┘${c.reset}`);
    if (foot) lines.push(foot);
    return lines;
  }

  _renderMenu() {
    const opts = this.options();
    const t = this.token;
    const title = this.typing !== null
      ? `type to filter — ⏎ to accept "${this.typing}"`
      : (t.hint || `choose a ${t.key}`);

    const rows = [];
    if (!opts.length) {
      rows.push(` ${c.italic}${c.dim}no match — keep typing, ⏎ uses your text${c.reset}`);
    } else {
      for (const o of opts.slice(this.menuOffset, this.menuOffset + MENU_H)) {
        const sel = o === (this.typing ?? t.value);
        rows.push(sel
          ? ` ${c.bold}${CYAN}› ${o}${c.reset}`
          : ` ${c.dim}  ${o}${c.reset}`);
      }
      if (opts.length > MENU_H) {
        rows.push(` ${c.dim}· · · ${opts.length} options${c.reset}`);
      }
    }
    return this._box(title, rows, null);
  }

  _renderBrowse() {
    const b = this.browse;
    const title = `in ${shortPath(b.path)}`;
    const rows = [];
    if (this.naming !== null) {
      rows.push(` ${AMBER}${c.bold}new folder: ${this.naming}▌${c.reset}  ${c.dim}⏎ create · esc cancel${c.reset}`);
    } else if (!b.entries.length) {
      rows.push(` ${c.italic}${c.dim}no folders here — n to create one, ⏎ to use this folder${c.reset}`);
    } else {
      for (const name of b.entries.slice(b.offset, b.offset + MENU_H)) {
        const sel = name === b.entries[b.index];
        rows.push(sel
          ? ` ${c.bold}${CYAN}› ${name}/${c.reset}`
          : ` ${c.dim}  ${name}/${c.reset}`);
      }
      if (b.entries.length > MENU_H) {
        rows.push(` ${c.dim}· · · ${b.entries.length} folders${c.reset}`);
      }
    }
    const foot = `  ${c.dim}space${c.reset} enter  ${c.dim}⌫${c.reset} up  ${c.dim}⏎${c.reset} select  ` +
      `${c.dim}n${c.reset} new  ${c.dim}type${c.reset} paste path  ${c.dim}esc${c.reset} close`;
    return this._box(title, rows, foot);
  }

  _renderOverlay() {
    return this._box('preferences · e or esc to close',
      this._overlayLines.map((l) => ' ' + l), null);
  }

  _renderKey() {
    const k = this.keyInput;
    const dots = '•'.repeat(Math.min(k.value.length, 28)) + (k.value.length > 28 ? '+' : '');
    return this._box(`paste ${k.env}`, [
      ` ${AMBER}${c.bold}${dots || '…'}${c.reset}${c.dim}  (${k.value.length} chars)${c.reset}`,
      ` ${c.dim}⏎ save locally · esc cancel · masked, never echoed${c.reset}`,
    ], null);
  }

  render() {
    const lines = [];
    lines.push('');
    lines.push('  ' + this.sentence());
    lines.push('');

    if (this.keyInput) lines.push(...this._renderKey());
    else if (this.overlay) lines.push(...this._renderOverlay());
    else if (this.mode === 'browse' && this.browse) lines.push(...this._renderBrowse());
    else lines.push(...this._renderMenu());

    lines.push('');
    if (this.error) {
      lines.push(`  ${c.bgRed}${c.bold}${c.white} ✖ ${this.error} ${c.reset}`);
    } else if (this.overlay) {
      lines.push(`  ${c.dim}e / esc${c.reset} close overlay`);
    } else {
      lines.push(
        `  ${c.dim}←→${c.reset} move   ${c.dim}↑↓${c.reset} value   ` +
        `${c.dim}type${c.reset} custom   ${c.dim}⏎${c.reset} grab   ${c.dim}e${c.reset} prefs   ` +
        `${c.dim}^K${c.reset} key   ${c.dim}esc${c.reset} quit`,
      );
    }
    return lines;
  }
}

function padRow(s, n) {
  const w = sw(s);
  return s + ' '.repeat(Math.max(1, n - w));
}

function shortPath(p) {
  const home = homedir();
  const s = p.startsWith(home) ? '~' + p.slice(home.length) : p;
  return s.length > 44 ? '…' + s.slice(-43) : s;
}
