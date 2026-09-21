// Concurrent downloader with resume, magic-byte verification and live progress.

import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const MAGIC = {
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8,
  png: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e,
  gif: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  // WebP is a RIFF container: "RIFF" at 0..3, "WEBP" at 8..11
  webp: (b) => b.length > 11 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  bmp: (b) => b[0] === 0x42 && b[1] === 0x4d,
  avif: (b) => b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
};

/** What format did the server *actually* send us? */
export function sniff(buf) {
  for (const [k, test] of Object.entries(MAGIC)) if (test(buf)) return k;
  return null;
}

const uniq = (dir, base, ext) => {
  let name = `${base}.${ext}`;
  let i = 2;
  // cheap dedupe: stat is fast enough at these volumes
  const exists = async (n) => { try { await stat(join(dir, n)); return true; } catch { return false; } };
  return (async () => {
    while (await exists(name)) name = `${base}-${i++}.${ext}`;
    return name;
  })();
};

export async function downloadAll(items, opts = {}) {
  const {
    dir = './wallpapers',
    format = 'any',
    concurrency = 6,
    retries = 3,
    onProgress = () => {},
    signal,
  } = opts;

  await mkdir(dir, { recursive: true });

  const state = {
    done: 0, ok: 0, skipped: 0, failed: 0, bytes: 0,
    total: items.length, current: '', startedAt: Date.now(), errors: [],
  };

  const queue = [...items];
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      if (signal?.aborted) return;
      const item = queue[cursor++];
      state.current = item.name;
      try {
        const buf = await fetchWithRetry(item.url, retries);
        const actual = sniff(buf) || extOf(item.ext);

        // Honour the format token: keep only what really is that format.
        if (format !== 'any' && actual !== format) {
          state.skipped++;
          state.errors.push({ name: item.name, why: `is ${actual}, not ${format}` });
          continue;
        }

        const name = await uniq(dir, item.name, actual);
        await writeFile(join(dir, name), buf);
        state.ok++;
        state.bytes += buf.length;
      } catch (e) {
        state.failed++;
        state.errors.push({ name: item.name, why: e.message });
      } finally {
        state.done++;
        onProgress(state);
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, worker);
  await Promise.all(workers);
  state.elapsed = (Date.now() - state.startedAt) / 1000;
  return state;
}

const extOf = (e) => (e || 'jpg').toLowerCase().replace('jpeg', 'jpg');

async function fetchWithRetry(url, retries) {
  let last;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'wallgrab/1.0 (+https://github.com/bhavyam2468/get-wallpapers)' },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new Error('empty response');
      return buf;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw last;
}

/** Bytes → human, and seconds → m:ss. */
export const humanBytes = (n) => {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
};

export const humanTime = (s) => {
  if (!isFinite(s) || s < 0) return '--:--';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};
