// Terminal primitives: colour, cursor, gradients. No dependencies.

export const esc = (s) => `\x1b[${s}`;

export const c = {
  reset: esc('0m'),
  bold: esc('1m'),
  dim: esc('2m'),
  italic: esc('3m'),
  underline: esc('4m'),
  inverse: esc('7m'),

  black: esc('30m'),
  red: esc('31m'),
  green: esc('32m'),
  yellow: esc('33m'),
  blue: esc('34m'),
  magenta: esc('35m'),
  cyan: esc('36m'),
  white: esc('37m'),
  gray: esc('90m'),

  bgBlack: esc('40m'),
  bgRed: esc('41m'),
  bgGreen: esc('42m'),
  bgYellow: esc('43m'),
  bgBlue: esc('44m'),
  bgMagenta: esc('45m'),
  bgCyan: esc('46m'),
};

export const clearLine = esc('2K');
export const cursorUp = (n = 1) => esc(`${n}A`);
export const cursorDown = (n = 1) => esc(`${n}B`);
export const cursorTo = (col) => esc(`${col + 1}G`);
export const hideCursor = esc('?25l');
export const showCursor = esc('?25h');
export const clearScreen = esc('2J') + esc('H');
export const saveCursor = esc('s');
export const restoreCursor = esc('u');

/** True when the terminal is very unlikely to render ANSI properly. */
export const supportsColor = () => {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  if (process.platform === 'win32') return true; // Windows Terminal / conhost on Win10+
  const term = process.env.TERM || '';
  if (term === 'dumb') return false;
  return Boolean(process.stdout.isTTY);
};

/** True when we can use 24-bit colour (used for the gradient banner). */
export const supportsTrueColor = () => {
  if (!supportsColor()) return false;
  const term = process.env.TERM || '';
  const ci = process.env.CI ? true : false;
  return /truecolor|24bit/i.test(process.env.COLORTERM || '') ||
    /xterm-256|alacritty|kitty|wezterm|ghostty|iterm|tmux/i.test(term) ||
    ci || process.platform === 'win32';
};

// Theme accents, resolved once at load.
export const CYAN = supportsTrueColor() ? esc('38;2;0;198;255m') : c.cyan;
export const AMBER = supportsTrueColor() ? esc('38;2;255;195;113m') : c.yellow;
export const GREEN = supportsTrueColor() ? esc('38;2;56;239;125m') : c.green;

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const rgbFg = ([r, g, b]) => esc(`38;2;${r};${g};${b}m`);
const rgbBg = ([r, g, b]) => esc(`48;2;${r};${g};${b}m`);

const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const mix = (from, to, t) => [
  lerp(from[0], to[0], t),
  lerp(from[1], to[1], t),
  lerp(from[2], to[2], t),
];

/**
 * Paint every visible column of `text` with a horizontal gradient.
 * Multiline strings keep the same gradient phase on every line so the
 * banner reads as one continuous sweep.
 */
export function gradient(text, stops) {
  if (!supportsTrueColor()) return text;
  const rgbStops = stops.map(hexToRgb);
  const lines = text.split('\n');
  const width = Math.max(...lines.map((l) => [...l].length));

  return lines
    .map((line) => {
      let col = 0;
      let out = '';
      for (const ch of line) {
        if (ch === ' ') {
          out += ' ';
          col++;
          continue;
        }
        const t = width <= 1 ? 0 : col / (width - 1);
        out += rgbFg(sample(rgbStops, t)) + ch + c.reset;
        col++;
      }
      return out;
    })
    .join('\n');
}

function sample(stops, t) {
  if (stops.length === 1) return stops[0];
  const scaled = t * (stops.length - 1);
  const i = Math.min(Math.floor(scaled), stops.length - 2);
  return mix(stops[i], stops[i + 1], scaled - i);
}

/** Vertical variant — used for the sidebar rules and the progress bar. */
export function gradientRows(rows, stops) {
  return rows.map((r, i) => {
    const t = rows.length <= 1 ? 0 : i / (rows.length - 1);
    if (!supportsTrueColor()) return r;
    return rgbFg(sample(stops.map(hexToRgb), t)) + r + c.reset;
  });
}

/** Strip ANSI so we can measure real display width. */
// eslint-disable-next-line no-control-regex
export const strip = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
export const width = (s) => [...strip(s)].length;

/** Bar like ▓▓▓▓░░░░ for a 0..1 fraction. */
export function bar(fraction, size = 24) {
  const f = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(f * size);
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

export const pad = (s, n, align = 'left') => {
  const w = width(s);
  if (w >= n) return s;
  const gap = ' '.repeat(n - w);
  if (align === 'right') return gap + s;
  if (align === 'center') {
    const l = Math.floor((n - w) / 2);
    return ' '.repeat(l) + s + ' '.repeat(n - w - l);
  }
  return s + gap;
};
