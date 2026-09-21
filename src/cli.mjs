#!/usr/bin/env node
// wallgrab — bulk wallpaper downloader with an inline sentence editor.

import process from 'node:process';
import { banner, rule, box, SPINNER, THEME } from './banner.mjs';
import { c, CYAN, AMBER, clearLine, cursorUp, hideCursor, showCursor, bar, supportsTrueColor, gradient } from './ansi.mjs';
import { SentenceEditor } from './tokens.mjs';
import { SOURCES, byId } from './sources.mjs';
import { downloadAll, humanBytes, humanTime } from './download.mjs';
import { loadConfig, saveConfig, clearConfig, configPath, defaultDir, mask } from './config.mjs';

const VERSION = '1.1.0';

// ─────────────────────────────────────────────────────────────── arg parsing

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--version' || a === '-v') out.version = true;
    else if (a === '--yes' || a === '-y') out.yes = true;
    else if (a === '--sources') out.sources = true;
    else if (a === '--reset') out.reset = true;
    else if (a === '--no-save') out.noSave = true;
    else if (a === '--prefs') out.prefs = true;
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
    ${CYAN}--dir${c.reset} <path>         output folder   ${c.dim}(default: ~/Downloads/wallgrab)${c.reset}
    ${CYAN}--format${c.reset} <ext>       jpg png webp gif avif any ${c.dim}(default: any)${c.reset}
    ${CYAN}--jobs${c.reset} <n>           parallel downloads        ${c.dim}(default: 6)${c.reset}
    ${CYAN}--theme${c.reset} <name>       ${themes}
    ${CYAN}--yes${c.reset}, -y            skip the editor, run immediately
    ${CYAN}--prefs${c.reset}             print stored preferences + keys (masked)
    ${CYAN}--reset${c.reset}             wipe stored preferences and exit
    ${CYAN}--no-save${c.reset}           don't remember this run's preferences
    ${CYAN}--sources${c.reset}            list every source and exit
    ${CYAN}--version${c.reset}, -v        print version
    ${CYAN}--help${c.reset}, -h           this screen

  ${c.bold}In the editor${c.reset}
    ${CYAN}← →${c.reset}  move between the highlighted words
    ${CYAN}↑ ↓${c.reset}  cycle that word's values
    ${CYAN}type${c.reset} filter the list, or paste your own value
    ${CYAN}⏎${c.reset}    run it        ${CYAN}e${c.reset} preferences overlay   ${CYAN}esc${c.reset} quit

  ${c.bold}Folder browser${c.reset} ${c.dim}(select the ${CYAN}into${c.reset}${c.dim} token, press ↓)${c.reset}
    ${CYAN}space${c.reset} enter folder   ${CYAN}⌫${c.reset} parent   ${CYAN}⏎${c.reset} select current
    ${CYAN}n${c.reset}     new folder     ${CYAN}type${c.reset} paste a full path   ${CYAN}esc${c.reset} close

  ${c.bold}Preferences${c.reset}
    Your last count · query · source · folder · options and any API keys are
    remembered in ${c.dim}${configPath()}${c.reset}
    and restored on the next run. Env vars always win over stored keys.

  ${c.bold}API keys${c.reset} ${c.dim}(only unsplash, pexels and pixabay need one)${c.reset}
    ${AMBER}export${c.reset} UNSPLASH_ACCESS_KEY=xxx    ${c.dim}https://unsplash.com/developers${c.reset}
    ${AMBER}export${c.reset} PEXELS_API_KEY=xxx         ${c.dim}https://www.pexels.com/api/${c.reset}
    ${AMBER}export${c.reset} PIXABAY_API_KEY=xxx        ${c.dim}https://pixabay.com/api/docs/${c.reset}
`;
}

function listSources() {
  const rows = SOURCES.map((s) => {
    const key = s.keyEnv ? `${c.yellow}needs ${s.keyEnv}${c.reset}` : `${c.green}no key${c.reset}`;
    return `  ${CYAN}${padStr(s.id, 11)}${c.reset} ${padStr(s.name, 24)} ${key}  ${c.dim}${s.blurb}${c.reset}`;
  });
  return `${banner('grape')}\n${rows.join('\n')}\n`;
}

const padStr = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));

// ─────────────────────────────────────────────────────────────── editor loop

async function runEditor(theme, cfg, persist) {
  const editor = new SentenceEditor(cfg?.values?.source || 'wallhaven', cfg?.values || {});
  editor.recentDirs = cfg?.recentDirs || [];
  process.stdout.write(hideCursor);

  // Redraw clears *downward* from the region start, so the banner printed
  // above is never touched (this is what the old upward-clearing draw broke).
  let printed = 0;
  const draw = () => {
    const next = editor.render();
    if (printed) {
      process.stdout.write(cursorUp(printed));
      for (let i = 0; i < printed; i++) process.stdout.write(clearLine + '\n');
      process.stdout.write(cursorUp(printed));
    }
    process.stdout.write(next.join('\n') + '\n');
    printed = next.length;
  };

  draw();
  let busy = false;

  return new Promise((resolve) => {
    // await persist before resolving, or process.exit() in main will kill the
    // async config write before it lands
    const finish = async (values) => {
      cleanup();
      if (!values) await persist(editor.values, editor.recentDirs); // remember even on quit
      resolve(values);
    };

    const handle = async (s) => {
      const t = editor.token;

      if (s === '\x03') return finish(null);                                   // ctrl+c
      if (s === '\x1b' && s.length === 1) {                                    // esc
        if (editor.overlay) { editor.toggleOverlay(cfg); return; }
        if (editor.naming !== null) { editor.naming = null; return; }
        if (editor.mode === 'browse') { editor._leaveModes(); return; }
        return finish(null);
      }
      if (s === '\x1b[D') { editor.move(-1); return; }
      if (s === '\x1b[C' || s === '\t') { editor.move(1); return; }

      if (s === '\x1b[A') { editor.cycle(-1); return; }
      if (s === '\x1b[B') {
        if (editor.overlay) return;
        if (t.dirToken && editor.mode !== 'browse') { await editor.openBrowse(); return; }
        editor.cycle(1);
        return;
      }

      if (s === '\r' || s === '\n') {
        if (editor.overlay) { editor.toggleOverlay(cfg); return; }
        if (editor.naming !== null) { await editor.browseNew(); return; }
        if (editor.mode === 'browse') { editor.browseSelect(); return; }
        editor.cancelTyping();
        const err = editor.commitError();
        if (err) { editor.error = err; return; }
        editor.recentDirs = [editor.values.dir, ...editor.recentDirs.filter((d) => d !== editor.values.dir)].slice(0, 5);
        return finish(editor.values);
      }

      if (s === '\x7f' || s === '\b') { editor.backspace(); return; }
      if (s === '\x15') { editor.cancelTyping(); return; }                      // ctrl+u
      if (s === ' ') {
        if (editor.mode === 'browse' && editor.naming === null) { await editor.browseEnter(); return; }
        editor.typeChar(' ');
        return;
      }
      if (s === 'n' && editor.mode === 'browse' && editor.naming === null) { editor.naming = ''; return; }
      if (s === 'e' && editor.mode !== 'browse' && editor.typing === null && !editor.overlay) {
        editor.toggleOverlay(cfg);
        return;
      }

      for (const ch of s) {
        if (ch >= ' ' && ch.charCodeAt(0) < 127) editor.typeChar(ch);
      }
    };

    const onData = (buf) => {
      if (busy) return;
      busy = true;
      handle(buf.toString())
        .then(() => draw())
        .finally(() => { busy = false; });
    };

    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(showCursor);
    };

    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

// ────────────────────────────────────────────────────────────────── running

async function resolveKey(src, cfg, wantSave) {
  if (!src.keyEnv) return { ok: true };
  const envKey = process.env[src.keyEnv];
  const stored = cfg?.keys?.[src.keyEnv];
  const key = envKey || stored;
  if (key) {
    // persist an env-provided key so the next run needs nothing
    if (envKey && wantSave && stored !== envKey) {
      cfg.keys = { ...cfg.keys, [src.keyEnv]: envKey };
    }
    return { ok: true, key, from: envKey ? 'env' : 'stored' };
  }
  return {
    ok: false,
    msg: `${src.name} needs a free API key.\n` +
         `    ${AMBER}export ${src.keyEnv}=your_key${c.reset}   ${c.dim}(it will be remembered)${c.reset}\n` +
         `    ${c.dim}${src.keyHint}${c.reset}\n\n` +
         `    Or pick a no-key source: ${SOURCES.filter((s) => !s.keyEnv).map((s) => s.id).join(', ')}`,
  };
}

async function execute(values, jobs, ctx) {
  const { theme, cfg, wantSave } = ctx;
  const src = byId(values.source);
  if (!src) { console.log(`${c.red}unknown source: ${values.source}${c.reset}`); return 1; }

  const keyRes = await resolveKey(src, cfg, wantSave);
  if (!keyRes.ok) { console.log('\n' + keyRes.msg + '\n'); return 1; }

  const params = { query: values.query, count: Math.max(1, parseInt(values.count, 10) || 100), ...values };

  console.log(`\n  ${CYAN}⟡${c.reset} searching ${c.bold}${src.name}${c.reset} for ${c.bold}"${params.query}"${c.reset} ${c.dim}(wanting ${params.count})${c.reset}` +
    (keyRes.from ? `  ${c.dim}key: ${keyRes.from}${c.reset}` : ''));

  let items;
  try {
    items = await src.search(params, keyRes.key);
  } catch (e) {
    console.log(`  ${c.bgRed}${c.bold}${c.white} ✖ ${c.reset} ${e.message}\n`);
    if (/HTML instead of JSON|403|429|503/.test(e.message)) {
      console.log(`  ${c.dim}That usually means the source rate-limited this IP. Wait a few`);
      console.log(`  minutes, lower --count, or try another source.${c.reset}\n`);
    }
    return 1;
  }

  if (!items?.length) { console.log(`  ${c.yellow}no results for that query — try different terms${c.reset}\n`); return 1; }
  console.log(`  ${c.green}✓${c.reset} found ${c.bold}${items.length}${c.reset} images\n`);

  let tick = 0;
  const onProgress = (st) => {
    const pct = st.total ? st.done / st.total : 0;
    const rate = st.bytes / Math.max(0.001, (Date.now() - st.startedAt) / 1000);
    const eta = st.done > 0 ? (st.bytes / st.done) * (st.total - st.done) / rate : 0;
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
    dir: values.dir, format: values.format || 'any', concurrency: jobs, onProgress,
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
    for (const e of st.errors.slice(0, 5)) console.log(`    ${c.dim}·${c.reset} ${e.name} ${c.dim}— ${e.why}${c.reset}`);
  }
  console.log(`\n  ${gradient('grab more →', ['#11998e', '#38ef7d'])} ${c.dim}run wallgrab again — your preferences are saved${c.reset}\n`);
  return 0;
}

// ────────────────────────────────────────────────────────────────────── main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = (await loadConfig()) || { values: {}, keys: {}, recentDirs: [] };
  const theme = args.theme && THEME[args.theme] ? args.theme
    : (cfg.theme && THEME[cfg.theme] ? cfg.theme : 'sunset');
  const wantSave = !args.noSave;

  if (args.reset) {
    const did = await clearConfig();
    console.log(did ? `  ${c.green}✓${c.reset} cleared ${configPath()}\n` : `  ${c.dim}nothing to clear${c.reset}\n`);
    return 0;
  }
  if (args.help) { console.log(help()); return 0; }
  if (args.version) { console.log(`wallgrab ${VERSION}`); return 0; }
  if (args.sources) { console.log(listSources()); return 0; }
  if (args.prefs) {
    console.log(`  ${c.bold}stored at${c.reset} ${configPath()}\n`);
    console.log(`  ${c.bold}values${c.reset}`);
    for (const [k, v] of Object.entries(cfg.values || {})) console.log(`    ${CYAN}${padStr(k, 10)}${c.reset} ${v}`);
    console.log(`  ${c.bold}keys${c.reset}`);
    for (const k of ['UNSPLASH_ACCESS_KEY', 'PEXELS_API_KEY', 'PIXABAY_API_KEY']) {
      console.log(`    ${padStr(k, 20)} ${cfg.keys?.[k] ? c.green + mask(cfg.keys[k]) + c.reset : c.dim + 'not set' + c.reset}`);
    }
    console.log('');
    return 0;
  }

  const persist = async (values, recentDirs) => {
    if (!wantSave) return;
    await saveConfig({
      values,
      keys: cfg.keys || {},
      recentDirs: recentDirs || [],
      theme,
    }).catch(() => {});
  };

  const jobs = parseInt(args.jobs, 10) || 6;
  const ctx = { theme, cfg, wantSave };

  // non-interactive: explicit --source runs straight away
  if (args.yes || args.source) {
    const src = byId(args.source || 'wallhaven');
    if (!src) { console.log(`${c.red}unknown source "${args.source}"${c.reset}\nTry: ${SOURCES.map((s) => s.id).join(', ')}`); return 1; }
    const prev = cfg.values || {};
    const values = {
      source: src.id,
      count: String(args.count ?? prev.count ?? src.defaults.count),
      query: args.query ?? prev.query ?? src.defaults.query,
      format: args.format ?? prev.format ?? 'any',
      dir: args.dir ?? prev.dir ?? defaultDir(),
    };
    for (const extra of src.extra) {
      values[extra.key] = args[extra.key] ?? prev[extra.key] ?? extra.value;
    }
    const code = await execute(values, jobs, ctx);
    if (code === 0 && wantSave) await persist(values, cfg.recentDirs);
    return code;
  }

  process.stdout.write(banner(theme));
  process.stdout.write('\n' + rule('─', 74, theme) + '\n');

  const values = await runEditor(theme, cfg, persist);
  if (!values) { console.log(`\n  ${c.dim}preferences saved — see you next time${c.reset}\n`); return 0; }

  const code = await execute(values, jobs, ctx);
  if (code === 0 && wantSave) await persist(values, values ? [values.dir, ...(cfg.recentDirs || []).filter((d) => d !== values.dir)].slice(0, 5) : cfg.recentDirs);
  return code;
}

const code = await main().catch((e) => {
  console.error(`\n${c.bgRed}${c.bold}${c.white} ✖ ${c.reset} ${e.stack || e.message}\n`);
  return 1;
});
process.stdout.write(showCursor);
process.exit(code);
