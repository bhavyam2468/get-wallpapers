// The inline editable command sentence.
//
//   download ⟨100⟩ ⟨minimal⟩ wallpapers from ⟨wallhaven⟩ as ⟨jpg⟩ into ⟨./wallpapers⟩
//
// ←/→ move between the ⟨tokens⟩, ↑/↓ cycle their values, typing filters the
// option list and lets you enter a custom value, ⏎ commits.

import { c, width as sw, supportsTrueColor } from './ansi.mjs';
import { SOURCES, byId, FORMATS } from './sources.mjs';

const CYAN = supportsTrueColor() ? '\x1b[38;2;0;198;255m' : c.cyan;
const AMBER = supportsTrueColor() ? '\x1b[38;2;255;195;113m' : c.yellow;

/** Build the token list for a source, keeping values the user already set. */
export function buildTokens(sourceId, prev = {}) {
  const src = byId(sourceId);
  const tokens = [
    {
      key: 'count', label: 'download', value: prev.count ?? String(src?.defaults.count ?? 100),
      options: ['10', '25', '50', '100', '250', '500', '1000'],
      suffix: '', validate: (v) => (/^\d+$/.test(v) && +v > 0) ? null : 'needs a whole number',
    },
    {
      key: 'query', label: '', value: prev.query ?? src?.defaults.query ?? 'minimal',
      options: ['minimal', 'minimalism', 'abstract', 'geometric', 'gradient', 'dark',
        'nature', 'space', 'city', 'architecture', 'texture', 'vaporwave', 'topographic'],
      freeform: true, hint: 'search terms',
    },
    {
      key: 'source', label: 'wallpapers from',
      value: sourceId,
      options: null, // filled below from the registry
      sourceToken: true,
    },
    {
      key: 'format', label: 'as', value: prev.format ?? 'any',
      options: FORMATS, hint: 'kept files must really be this format',
    },
    {
      key: 'dir', label: 'into', value: prev.dir ?? './wallpapers',
      freeform: true, hint: 'output folder',
    },
  ];

  for (const extra of src?.extra || []) {
    tokens.push({
      ...extra,
      value: prev[extra.key] ?? extra.value,
      label: extra.label,
    });
  }
  return tokens;
}

/**
 * Stateful editor. `render()` returns the exact lines to draw; the caller owns
 * the screen and just replays them.
 */
export class SentenceEditor {
  constructor(sourceId, initial = {}) {
    this.tokens = buildTokens(sourceId, initial);
    this.index = 0;
    this.typing = null; // null, or the partial string being typed
    this.menuOffset = 0;
    this.lastLines = 0;
    this.error = null;
  }

  get token() { return this.tokens[this.index]; }
  get values() { return Object.fromEntries(this.tokens.map((t) => [t.key, t.value])); }

  /** Options for the selected token, honouring the active type-filter. */
  options() {
    const t = this.token;
    if (t.sourceToken) {
      return SOURCES.map((s) => s.id);
    }
    let opts = t.options ? [...t.options] : [];
    if (this.typing) {
      const q = this.typing.toLowerCase();
      const hits = opts.filter((o) => o.toLowerCase().includes(q));
      opts = hits;
      if (t.freeform !== false && !opts.some((o) => o === this.typing)) {
        opts = [this.typing, ...opts];
      }
    }
    return opts;
  }

  move(delta) {
    const n = this.tokens.length;
    this.index = (this.index + delta + n) % n;
    this.typing = null; this.menuOffset = 0; this.error = null;
    // switching source rebuilds the extra tokens
    if (this.token.sourceToken) this._noteSource = true;
  }

  cycle(delta) {
    const opts = this.options();
    if (!opts.length) return;
    const cur = opts.indexOf(this.typing ?? this.token.value);
    const next = cur === -1
      ? (delta > 0 ? 0 : opts.length - 1)
      : (cur + delta + opts.length) % opts.length;
    this.menuOffset = Math.max(0, next - 5);
    this._apply(opts[next]);
  }

  jumpTo(value) {
    this.menuOffset = 0;
    this._apply(value);
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
    // First keystroke starts from an empty buffer, not from the old value.
    this.typing = (this.typing ?? '') + ch;
    this.menuOffset = 0;
    this._apply(this.typing);
  }

  clearTyping() {
    this.typing = '';
    this.menuOffset = 0;
    if (this.token.freeform) this._apply('');
  }

  cancelTyping() { this.typing = null; this.error = null; this.menuOffset = 0; }

  /**
   * Validate everything on ⏎. Returns an error string, or null if the
   * sentence is safe to run. Keeps the user in the editor instead of
   * bailing out to a failed run.
   */
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

  backspace() {
    if (this.typing === null) return;
    this.typing = this.typing.slice(0, -1);
    this.menuOffset = 0;
    if (this.token.freeform) this._apply(this.typing);
  }

  // ── rendering ──────────────────────────────────────────────────────────

  /** The sentence, with the active token highlighted. */
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

  render(menuHeight = 8) {
    const lines = [];
    lines.push('');
    lines.push('  ' + this.sentence());
    lines.push('');

    const opts = this.options();
    const t = this.token;

    const title = this.typing !== null
      ? `type to filter — ⏎ to accept "${this.typing}"`
      : (t.hint || `choose a ${t.key}`);

    lines.push(`  ${c.dim}┌ ${c.bold}${title}${c.reset}${c.dim} ${'─'.repeat(Math.max(2, 46 - sw(title)))}┐${c.reset}`);

    if (!opts.length) {
      lines.push(`  ${c.dim}│${c.reset} ${c.italic}${c.dim}no match — keep typing, ⏎ uses your text${c.reset}${' '.repeat(12)}${c.dim}│${c.reset}`);
    } else {
      const view = opts.slice(this.menuOffset, this.menuOffset + menuHeight);
      for (const o of view) {
        const sel = o === (this.typing ?? t.value);
        const row = sel
          ? `${c.bold}${CYAN}  › ${o}${c.reset}`
          : `${c.dim}    ${o}${c.reset}`;
        lines.push(`  ${c.dim}│${c.reset}${padEnd(row, 47)}${c.dim}│${c.reset}`);
      }
      if (opts.length > menuHeight) {
        lines.push(`  ${c.dim}│    · · · ${opts.length} options${' '.repeat(Math.max(0, 30))}│${c.reset}`);
      }
    }
    lines.push(`  ${c.dim}└${'─'.repeat(48)}┘${c.reset}`);
    lines.push('');

    if (this.error) {
      lines.push(`  ${c.bgRed}${c.bold}${c.white} ✖ ${this.error} ${c.reset}`);
    } else {
      lines.push(
        `  ${c.dim}←→${c.reset} move   ${c.dim}↑↓${c.reset} value   ` +
        `${c.dim}type${c.reset} custom   ${c.dim}⏎${c.reset} grab   ${c.dim}esc${c.reset} quit`,
      );
    }
    return lines;
  }
}

function padEnd(s, n) {
  const w = sw(s);
  return s + ' '.repeat(Math.max(0, n - w));
}
