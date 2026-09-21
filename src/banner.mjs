import { gradient, gradientRows, c, supportsTrueColor } from './ansi.mjs';

// ANSI-shadow glyphs, 8 columns wide, 6 rows tall.
const GLYPHS = {
  W: ['██╗    ██╗', '██║    ██║', '██║ █╗ ██║', '██║███╗██║', '╚███╔███╔╝', ' ╚══╝╚══╝ '],
  A: [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
  L: ['██╗     ', '██║     ', '██║     ', '██║     ', '███████╗', '╚══════╝'],
  G: [' ██████╗ ', '██╔════╝ ', '██║  ███╗', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
  R: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██║  ██║', '╚═╝  ╚═╝'],
  B: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██████╔╝', '╚═════╝ '],
  ' ': ['        ', '        ', '        ', '        ', '        ', '        '],
};

const word = (w) => {
  const rows = ['', '', '', '', '', ''];
  for (const ch of w.toUpperCase()) {
    const g = GLYPHS[ch] || GLYPHS[' '];
    g.forEach((line, i) => { rows[i] += line; });
  }
  return rows;
};

export const THEME = {
  sunset: ['#ff5f6d', '#ffc371'],
  ocean: ['#00c6ff', '#0072ff'],
  grape: ['#8e2de2', '#4a00e0'],
  mint: ['#11998e', '#38ef7d'],
  ember: ['#f7971e', '#ffd200'],
  rose: ['#ee9ca7', '#ff6a88'],
};

/**
 * Big gradient banner. Falls back to plain text on terminals without
 * truecolour so it never prints garbage.
 */
export function banner(theme = 'sunset') {
  const rows = word('WALLGRAB');
  const stops = THEME[theme] || THEME.sunset;
  const art = supportsTrueColor() ? gradient(rows.join('\n'), stops) : rows.join('\n');

  const tagline = gradientRows([
    '  bulk wallpapers · eleven sources · zero dependencies',
    '  ↑↓ pick a value · ←→ move between them · ⏎ grab',
  ], stops);

  return `\n${art}\n\n${tagline.join('\n')}\n`;
}

/** Horizontal rule that matches the theme. */
export function rule(char = '─', n = 74, theme = 'sunset') {
  const stops = THEME[theme] || THEME.sunset;
  const line = char.repeat(n);
  return supportsTrueColor() ? gradient(line, stops) : line;
}

/** Small framed box used for the completion summary. */
export function box(lines, title, theme = 'sunset') {
  const inner = Math.max(
    ...lines.map((l) => [...strip(l)].length),
    title ? [...title].length + 4 : 0,
  );
  const w = Math.min(inner + 2, 72);
  const stops = THEME[theme] || THEME.sunset;
  const paint = (s) => (supportsTrueColor() ? gradient(s, stops) : s);

  const top = title
    ? `╭─${c.bold} ${title} ${c.reset}${paint('─'.repeat(Math.max(0, w - title.length - 4)))}╮`
    : paint(`╭${'─'.repeat(w)}╮`);
  const bottom = paint(`╰${'─'.repeat(w)}╯`);
  const body = lines.map(
    (l) => `${paint('│')} ${pad(strip(l), w - 2)} ${paint('│')}`,
  );
  return [top, ...body, bottom].join('\n');
}

import { strip, pad } from './ansi.mjs';

export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
