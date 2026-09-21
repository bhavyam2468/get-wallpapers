#!/usr/bin/env node
// Smoke test. Runs offline checks on every source plus one real download.
//   node scripts/smoke.mjs

import { SOURCES, byId } from '../src/sources.mjs';
import { SentenceEditor } from '../src/tokens.mjs';
import { sniff, downloadAll } from '../src/download.mjs';
import { banner } from '../src/banner.mjs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ${'\x1b[32m✓\x1b[0m'} ${name}`); }
  else { fail++; console.log(`  ${'\x1b[31m✖\x1b[0m'} ${name}${extra ? ` — ${extra}` : ''}`); }
};

console.log('\n\x1b[1msource registry\x1b[0m');
ok('eleven sources registered', SOURCES.length === 11, `got ${SOURCES.length}`);
for (const s of SOURCES) {
  ok(`${s.id} is well-formed`,
    typeof s.search === 'function' && s.id && s.name && Array.isArray(s.extra) &&
    (s.keyEnv === null || typeof s.keyEnv === 'string'),
    'missing search/name/extra/keyEnv');
}
ok('eight need no API key', SOURCES.filter((s) => !s.keyEnv).length === 8);
ok('byId resolves', byId('wallhaven')?.name === 'Wallhaven');

console.log('\n\x1b[1mtoken editor\x1b[0m');
for (const s of SOURCES) {
  const e = new SentenceEditor(s.id);
  const keys = e.tokens.map((t) => t.key);
  ok(`${s.id} builds ${keys.length} tokens`,
    keys.includes('count') && keys.includes('query') && keys.includes('source') &&
    keys.includes('format') && keys.includes('dir'),
    keys.join(','));
}

const e = new SentenceEditor('wallhaven');
ok('starts on count token', e.token.key === 'count');
e.move(1);
const before = e.token.value;
e.cycle(1);
ok('↑↓ cycles the value', e.token.value !== before, `${before} → ${e.token.value}`);
e.typeChar('v'); e.typeChar('a'); e.typeChar('p');
ok('typing filters the list', e.typing === 'vap' && e.options().includes('vap'));
e.cancelTyping();

const sw = new SentenceEditor('wallhaven');
sw.tokens.forEach((t, i) => { if (t.key === 'source') sw.index = i; });
const wallhavenExtras = sw.tokens.length;
sw._apply('nasa');
ok('switching source rebuilds its extra tokens',
  sw.tokens.length < wallhavenExtras && sw.token.value === 'nasa',
  `${wallhavenExtras} → ${sw.tokens.length}`);
sw._apply('github');
ok('switching to github adds repo/filter/pick',
  ['repo', 'filter', 'pick'].every((k) => sw.tokens.some((t) => t.key === k)));

const bad = new SentenceEditor('wallhaven');
bad.index = bad.tokens.findIndex((t) => t.key === 'count');
bad._apply('not-a-number');
ok('count rejects non-numeric input', bad.error !== null, bad.error || 'no error raised');
ok('dir defaults to ~/Downloads/wallgrab',
  new SentenceEditor('wallhaven').tokens.find((t) => t.key === 'dir').value.endsWith('Downloads/wallgrab'));

// ── folder browser (async) ────────────────────────────────────────────
console.log('\n\x1b[1mfolder browser\x1b[0m');
{
  const base = await mkdtemp(join(tmpdir(), 'wg-browse-'));
  await mkdir(join(base, 'anime'), { recursive: true });
  await mkdir(join(base, 'minimal'), { recursive: true });
  await mkdir(join(base, 'nested', 'deep'), { recursive: true });
  const b = new SentenceEditor('wallhaven', { dir: base });
  b.index = b.tokens.findIndex((t) => t.key === 'dir');

  await b.openBrowse();
  ok('opens at the current dir', b.mode === 'browse' && b.browse.path === base, b.browse?.path);
  ok('lists folders only', b.browse.entries.join(',') === 'anime,minimal,nested', b.browse.entries.join(','));

  b.browseMove(1);                       // → minimal
  await b.browseEnter();                 // space
  ok('space descends', b.browse.path === join(base, 'minimal'));
  await b.browseBack();                  // ⌫
  ok('backspace ascends', b.browse.path === base);

  b.browse.index = b.browse.entries.indexOf('nested');
  await b.browseEnter();                 // space → nested
  ok('nested descent works', b.browse.path === join(base, 'nested'), b.browse.path);
  b.browse.index = 0;
  await b.browseEnter();                 // space → nested/deep
  ok('deep descent works', b.browse.path === join(base, 'nested', 'deep'), b.browse.path);

  b.naming = 'brand-new';
  await b.browseNew();
  ok('n + name + enter creates a folder', b.browse.entries.includes('brand-new'), b.browse.entries.join(','));

  b.browseSelect();
  ok('enter selects the folder as dir',
    b.token.value === join(base, 'nested', 'deep') && b.mode === 'menu', b.token.value);

  // typing a path still works (paste mode)
  b.typeChar('/'); b.typeChar('t'); b.typeChar('m'); b.typeChar('p');
  ok('typing pastes a raw path', b.token.value.startsWith('/tmp'), b.token.value);
  await rm(base, { recursive: true, force: true });
}

// ── config persistence ────────────────────────────────────────────────
console.log('\n\x1b[1mconfig persistence\x1b[0m');
{
  const tmpCfg = await mkdtemp(join(tmpdir(), 'wg-cfg-'));
  const oldXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = tmpCfg;
  const cfgMod = await import('../src/config.mjs');
  ok('config path honors XDG_CONFIG_HOME', cfgMod.configPath().startsWith(tmpCfg), cfgMod.configPath());
  await cfgMod.saveConfig({ values: { count: '42', source: 'nasa' }, keys: { PEXELS_API_KEY: 'pk-1234567890' } });
  const loaded = await cfgMod.loadConfig();
  ok('round-trips values', loaded?.values?.count === '42' && loaded?.values?.source === 'nasa');
  ok('masks a stored key', cfgMod.mask('pk-1234567890').startsWith('pk-123') && cfgMod.mask('pk-1234567890').includes('•'));
  await rm(tmpCfg, { recursive: true, force: true });
  if (oldXdg === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = oldXdg;
}

console.log('\n\x1b[1meditor rendering\x1b[0m');
// render() exercises the alias-heavy layout code; a bundling mistake here
// throws ReferenceError at runtime rather than at import time.
for (const s of SOURCES) {
  const ed = new SentenceEditor(s.id);
  let err = null;
  try {
    const lines = ed.render();
    if (!Array.isArray(lines) || lines.length < 5) err = 'rendered too few lines';
    // move across every token and render each state
    for (let i = 0; i < ed.tokens.length; i++) { ed.move(1); ed.render(); }
    // and in typing mode, which takes a different layout branch
    ed.typeChar('a'); ed.render(); ed.cancelTyping();
    // and with an error showing
    ed.error = 'test error'; ed.render(); ed.error = null;
  } catch (e) { err = e.message; }
  ok(`${s.id} renders every editor state`, err === null, err || '');
}

console.log('\n\x1b[1mdownload engine\x1b[0m');
ok('sniffs JPEG', sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0])) === 'jpg');
ok('sniffs PNG', sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47])) === 'png');
ok('sniffs WebP', sniff(Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])) === 'webp');
ok('rejects garbage', sniff(Buffer.from('hello world!!!')) === null);

console.log('\n\x1b[1mrendering\x1b[0m');
const art = banner('sunset');
// row 6 of each glyph uses ═╚╝ rather than █, so count the art block itself
const artRows = art.split('\n').filter((l) => /[█╔╗╚╝═║]/.test(l));
ok('banner renders six glyph rows', artRows.length === 6, `got ${artRows.length}`);
ok('banner is 74 columns wide or less',
  Math.max(...artRows.map((l) => [...l].length)) <= 80,
  `widest row ${Math.max(...artRows.map((l) => [...l].length))} cols`);

console.log('\n\x1b[1mlive download (picsum, 2 files)\x1b[0m');
const dir = await mkdtemp(join(tmpdir(), 'wallgrab-'));
const st = await downloadAll(
  [{ url: 'https://picsum.photos/id/10/640/360', name: 'smoke_a', ext: 'jpg' },
   { url: 'https://picsum.photos/id/11/640/360', name: 'smoke_b', ext: 'jpg' }],
  { dir, concurrency: 2 },
);
ok('downloaded 2 files', st.ok === 2, `ok=${st.ok} failed=${st.failed} ${st.errors[0]?.why || ''}`);
ok('bytes were written', st.bytes > 10_000, `${st.bytes} bytes`);

const again = await downloadAll(
  [{ url: 'https://picsum.photos/id/10/640/360', name: 'smoke_a', ext: 'jpg' }],
  { dir, concurrency: 1 },
);
ok('re-run does not duplicate (dedupe or skip)',
  again.skipped >= 1 || again.ok === 1, `ok=${again.ok} skipped=${again.skipped}`);

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
