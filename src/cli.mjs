#!/usr/bin/env node
// wallgrab — bulk wallpaper downloader with an inline sentence editor.

import process from 'node:process';
import readline from 'node:readline';
import { banner, rule, box, SPINNER, THEME } from './banner.mjs';
import { c, clearLine, cursorUp, hideCursor, showCursor, bar, supportsTrueColor, gradient } from './ansi.mjs';
import { SentenceEditor } from './tokens.mjs';
import { SOURCES, byId } from './sources.mjs';
import { downloadAll, humanBytes, humanTime } from './download.mjs';

const VERSION = '1.0.0';
const CYAN = supportsTrueColor() ? '\x1b[38;2;0;198;255m' : c.cyan;
const AMBER = supportsTrueColor() ? '\x1b[38;2;255;195;113m' : c.yellow;

// ─────────────────────────────────────────────────────────────── arg parsing

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--version' || a === '-v') out.version = true;
    else if (a === '--yes' || a === '-y') out.yes = true;
    else if (a === '--sources') out.sources = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

function help() {
  const themes = Object.keys(THEME).join(' · ');
  return `${banner('ocean')}
${rule('─', 74, 'ocean')}

  ${c.bold}Usage${c.reset}
    wallgrab                          interactive sentence editor
    wallgrab ${c.dim}[flags]${c.reset} --yes           non-interactive, for scripts & CI

  ${c.bold}Flags${c.reset}
    ${CYAN}--source${c.reset} <id>        ${c.dim}wallhaven · unsplash · nasa · openverse · pexels${c.reset}
                         ${c.dim}pixabay · artic · met · picsum · github · reddit${c.reset}
    ${CYAN}--query${c.reset} <text>       search terms              ${c.dim}(default: minimal)${c.reset}
    ${CYAN}--count${c.reset} <n>          how many to fetch         ${c.dim}(default: 100)${c.reset}
    ${CYAN}--dir${c.reset} <path>         output folder             ${c.dim}(default: ./wallpapers)${c.reset}
    ${CYAN}--format${c.reset} <ext>       jpg png webp gif avif any ${c.dim}(default: any)${c.reset}
    ${CYAN}--jobs${c.reset} <n>           parallel downloads        ${c.dim}(default: 6)${c.reset}
    ${CYAN}--theme${c.reset} <name>       ${themes}
    ${CYAN}--yes${c.reset}, -y            skip the editor, run immediately
    ${CYAN}--sources${c.reset}            list every source and exit
    ${CYAN}--version${c.reset}, -v        print version
    ${CYAN}--help${c.reset}, -h           this screen

  ${c.bold}Source-specific flags${c.reset} ${c.dim}(only read when that source is selected)${c.reset}
    wallhaven  --resolution 2560x1440 --sort favorites --ratio 16x9
               --color 333399 --category general
    github     --repo dharmx/walls --filter abstract --pick largest
    reddit     --subreddit MinimalWallpaper --window year
    picsum     --size 3840x2160 --mode grayscale
    artic      --iiifWidth 3000px
    openverse  --license cc0 --size large
    unsplash   --orientation landscape --sort latest
    pexels     --orientation landscape --color blue
    pixabay    --imageType illustration --orientation horizontal

  ${c.bold}API keys${c.reset} ${c.dim}(only unsplash, pexels and pixabay need one)${c.reset}
    ${AMBER}export${c.reset} UNSPLASH_ACCESS_KEY=xxx    ${c.dim}https://unsplash.com/developers${c.reset}
    ${AMBER}export${c.reset} PEXELS_API_KEY=xxx         ${c.dim}https://www.pexels.com/api/${c.reset}
    ${AMBER}export${c.reset} PIXABAY_API_KEY=xxx        ${c.dim}https://pixabay.com/api/docs/${c.reset}

  ${c.bold}In the editor${c.reset}
    ${CYAN}← →${c.reset}  move between the highlighted words
    ${CYAN}↑ ↓${c.reset}  cycle that word's values
    ${CYAN}type${c.reset} filter the list, or enter your own value
    ${CYAN}⏎${c.reset}    run it      ${CYAN}esc${c.reset} quit      ${CYAN}ctrl+c${c.reset} abort a download
`;
}

function listSources() {
  const rows = SOURCES.map((s) => {
    const key = s.keyEnv ? `${c.yellow}needs ${s.keyEnv}${c.reset}` : `${c.green}no key${c.reset}`;
    return `  ${CYAN}${pad(s.id, 11)}${c.reset} ${pad(s.name, 24)} ${key}  ${c.dim}${s.blurb}${c.reset}`;
  });
  return `${banner('grape')}\n${rows.join('\n')}\n`;
}

const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));

// ─────────────────────────────────────────────────────────────── editor loop

async function runEditor(theme) {
  const editor = new SentenceEditor('wallhaven');
  process.stdout.write(hideCursor);

  let lines = editor.render();
  const draw = () => {
    if (lines.length) {
      process.stdout.write(cursorUp(lines.length) + lines.map(() => clearLine).join(cursorUp(1)));
      process.stdout.write(cursorUp(lines.length));
      for (let i = 0; i < lines.length; i++) process.stdout.write(clearLine + '\n');
      process.stdout.write(cursorUp(lines.length));
    }
    lines = editor.render();
    process.stdout.write(lines.join('\n'));
  };

  draw();

  return new Promise((resolve) => {
    const onData = (buf) => {
      const s = buf.toString();

      if (s === '\x03') { cleanup(); resolve(null); return; }        // ctrl+c
      if (s === '\x1b' && buf.length === 1) { cleanup(); resolve(null); return; } // esc

      if (s === '\x1b[D') { editor.move(-1); draw(); return; }       // ←
      if (s === '\x1b[C') { editor.move(1); draw(); return; }        // →
      if (s === '\x1b[A') { editor.cycle(-1); draw(); return; }      // ↑
      if (s === '\x1b[B') { editor.cycle(1); draw(); return; }       // ↓
      if (s === '\t') { editor.move(1); draw(); return; }

      if (s === '\r' || s === '\n') {
        editor.cancelTyping();
        const err = editor.commitError();
        if (err) { editor.error = err; draw(); return; }
        cleanup();
        resolve(editor.values);
        return;
      }
      if (s === '\x7f' || s === '\b') { editor.backspace(); draw(); return; }
      if (s === '\x15') { editor.clearTyping(); draw(); return; }    // ctrl+u

      // printable characters start/extend the filter
      for (const ch of s) {
        if (ch >= ' ' && ch.charCodeAt(0) < 127) editor.typeChar(ch);
      }
      draw();
    };

    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(showCursor + '\n');
    };

    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

// ────────────────────────────────────────────────────────────────── running

async function resolveKey(src) {
  if (!src.keyEnv) return { ok: true };
  const key = process.env[src.keyEnv];
  if (key) return { ok: true, key };
  return {
    ok: false,
    msg: `${src.name} needs a free API key.\n` +
         `    ${AMBER}export ${src.keyEnv}=your_key${c.reset}\n` +
         `    ${c.dim}${src.keyHint}${c.reset}\n\n` +
         `    Or pick a no-key source: ${SOURCES.filter((s) => !s.keyEnv).map((s) => s.id).join(', ')}`,
  };
}

async function execute(values, jobs) {
  const src = byId(values.source);
  if (!src) { console.log(`${c.red}unknown source: ${values.source}${c.reset}`); return 1; }

  const keyRes = await resolveKey(src);
  if (!keyRes.ok) { console.log('\n' + keyRes.msg + '\n'); return 1; }

  const params = {
    query: values.query,
    count: Math.max(1, parseInt(values.count, 10) || 100),
    ...values,
  };

  console.log(`\n  ${CYAN}⟡${c.reset} searching ${c.bold}${src.name}${c.reset} for ${c.bold}"${params.query}"${c.reset} ${c.dim}(wanting ${params.count})${c.reset}\n`);

  let items;
  try {
    items = await src.search(params, keyRes.key);
  } catch (e) {
    console.log(`  ${c.bgRed}${c.bold}${c.white} ✖ ${c.reset} ${e.message}\n`);
    if (/HTML instead of JSON|403|429/.test(e.message)) {
      console.log(`  ${c.dim}That usually means the source rate-limited this IP. Wait a few`);
      console.log(`  minutes, lower --count, or try another source.${c.reset}\n`);
    }
    return 1;
  }

  if (!items?.length) {
    console.log(`  ${c.yellow}no results for that query — try different terms${c.reset}\n`);
    return 1;
  }
  console.log(`  ${c.green}✓${c.reset} found ${c.bold}${items.length}${c.reset} images\n`);

  // progress line
  let tick = 0;
  const onProgress = (st) => {
    const pct = st.total ? st.done / st.total : 0;
    const rate = st.bytes / Math.max(0.001, (Date.now() - st.startedAt) / 1000);
    const eta = rate > 0 ? (st.total - st.done) * (st.bytes / Math.max(1, st.done)) / rate : 0;
    const spin = SPINNER[tick++ % SPINNER.length];
    process.stdout.write(
      '\r' + clearLine +
      `  ${CYAN}${spin}${c.reset} ${bar(pct, 26)} ` +
      `${c.bold}${String(st.done).padStart(4)}/${st.total}${c.reset} ` +
      `${c.green}${st.ok}✓${c.reset} ${c.dim}${st.skipped}–${c.reset} ${c.red}${st.failed}✖${c.reset} ` +
      `${AMBER}${humanBytes(st.bytes)}${c.reset} ${c.dim}@ ${humanBytes(rate)}/s · eta ${humanTime(eta)}${c.reset}`,
    );
  };

  const st = await downloadAll(items, {
    dir: values.dir,
    format: values.format || 'any',
    concurrency: jobs,
    onProgress,
  });
  process.stdout.write('\n\n');

  const lines = [
    `${c.green}${c.bold}${st.ok}${c.reset} wallpapers saved  ${c.dim}(${humanBytes(st.bytes)})${c.reset}`,
    st.skipped ? `${c.yellow}${st.skipped}${c.reset} skipped  ${c.dim}(already there, or wrong format)${c.reset}` : null,
    st.failed ? `${c.red}${st.failed}${c.reset} failed` : null,
    `${c.dim}${st.elapsed.toFixed(1)}s · ${values.dir}${c.reset}`,
  ].filter(Boolean);

  console.log(box(lines, 'done', 'mint'));

  if (st.errors.length) {
    console.log(`\n  ${c.dim}first few problems:${c.reset}`);
    for (const e of st.errors.slice(0, 5)) {
      console.log(`    ${c.dim}·${c.reset} ${e.name} ${c.dim}— ${e.why}${c.reset}`);
    }
  }
  console.log(`\n  ${gradient('grab more →', ['#11998e', '#38ef7d'])} ${c.dim}run wallgrab again${c.reset}\n`);
  return 0;
}

// ────────────────────────────────────────────────────────────────────── main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const theme = args.theme && THEME[args.theme] ? args.theme : 'sunset';

  if (args.help) { console.log(help()); return 0; }
  if (args.version) { console.log(`wallgrab ${VERSION}`); return 0; }
  if (args.sources) { console.log(listSources()); return 0; }

  // non-interactive: any explicit --source runs straight away
  if (args.yes || args.source) {
    const src = byId(args.source || 'wallhaven');
    if (!src) { console.log(`${c.red}unknown source "${args.source}"${c.reset}\nTry: ${SOURCES.map((s) => s.id).join(', ')}`); return 1; }
    const values = {
      source: src.id,
      count: String(args.count ?? src.defaults.count),
      query: args.query ?? src.defaults.query,
      format: args.format ?? 'any',
      dir: args.dir ?? './wallpapers',
    };
    for (const extra of src.extra) {
      if (args[extra.key] !== undefined) values[extra.key] = args[extra.key];
      else values[extra.key] = extra.value;
    }
    return execute(values, parseInt(args.jobs, 10) || 6);
  }

  process.stdout.write(banner(theme));
  process.stdout.write('\n' + rule('─', 74, theme) + '\n');

  const values = await runEditor(theme);
  if (!values) { console.log(`  ${c.dim}nothing grabbed — see you next time${c.reset}\n`); return 0; }

  return execute(values, parseInt(args.jobs, 10) || 6);
}

const code = await main().catch((e) => {
  console.error(`\n${c.bgRed}${c.bold}${c.white} ✖ ${c.reset} ${e.stack || e.message}\n`);
  return 1;
});
process.stdout.write(showCursor);
process.exit(code);
