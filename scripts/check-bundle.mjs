#!/usr/bin/env node
// Gate: the single-file bundle must behave identically to src/.
//
// The bundle is generated, so a bundling mistake (a lost import alias, a
// redeclaration, a dropped helper) only shows up at RUNTIME in the bundle —
// src/ keeps working and the smoke suite stays green. This runs the bundle
// itself through the same code paths.

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = join(root, 'wallgrab.mjs');

// eslint-disable-next-line no-control-regex
const plain = (t) => t.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✖\x1b[0m ${name}${extra ? ` — ${extra}` : ''}`); }
};

function run(args, { stdin = 'ignore' } = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [bundle, ...args], { cwd: root, stdio: [stdin, 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    if (stdin !== 'ignore') p.stdin.end();
    p.on('close', (code) => resolve({ code, out, err, all: out + err }));
  });
}

console.log('\n\x1b[1mbundle integration\x1b[0m');

const v = await run(['--version']);
ok('--version works', v.code === 0 && v.out.includes('wallgrab'), v.all.slice(0, 120));

const s = await run(['--sources']);
// count real rows: two spaces, a source id, then a key column.
// (a naive /no key/ also matches nasa's blurb "no key needed")
// assert each known id appears as its own row, rather than parsing the layout
const EXPECTED = ['wallhaven','unsplash','nasa','openverse','pexels','pixabay',
                  'artic','met','picsum','github','reddit'];
// match on the known ids only: the banner tagline also starts with two spaces
const rows = plain(s.out).split('\n').filter((l) => EXPECTED.some((id) => l.startsWith(`  ${id} `)));
const missing = EXPECTED.filter((id) => !rows.some((l) => l.startsWith(`  ${id} `)));
ok('--sources lists all 11 providers', rows.length === 11 && missing.length === 0,
  missing.length ? `missing ${missing.join(',')}` : `found ${rows.length}`);
ok('marks exactly 8 as needing no key',
  rows.filter((l) => l.includes('no key  ')).length === 8,
  `found ${rows.filter((l) => l.includes('no key  ')).length}`);

const h = await run(['--help']);
ok('--help renders', h.code === 0 && h.out.includes('Usage') && h.out.includes('--source'));

// The editor paints even when stdin is not a TTY — draw() runs before the
// input loop, so a ReferenceError in render() surfaces here. This is the
// exact path that shipped broken once (a lost `width as sw` alias).
const e = await run([], { stdin: 'pipe' });
ok('editor renders without a ReferenceError', !/ReferenceError|is not defined/.test(e.all),
  (e.all.match(/ReferenceError[^\n]*/) || [''])[0]);
const ePlain = plain(e.out);
ok('editor paints the sentence', /download\s+\d+\s+\S+\s+wallpapers from\s+\S+/.test(ePlain),
  (ePlain.split('\n').find((l) => l.includes('download')) || 'sentence missing').trim().slice(0, 80));
ok('editor paints the option box', e.out.includes('┌') && e.out.includes('│'), 'box missing');
ok('editor paints the key hints', /move/.test(e.out) && /value/.test(e.out), 'hints missing');

const bad = await run(['--source', 'does-not-exist', '--yes']);
ok('rejects an unknown source', bad.code !== 0 && /unknown source/.test(bad.all));

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
