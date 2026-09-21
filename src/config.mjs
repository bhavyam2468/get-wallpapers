// Persistent preferences. First run remembers; every run after starts
// from where you left off. Keys are optional and only stored if present.

import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

export function configDir() {
  if (platform() === 'win32') {
    const base = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
    return join(base, 'wallgrab');
  }
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'wallgrab');
}

export const configPath = () => join(configDir(), 'config.json');

export async function loadConfig() {
  try {
    const cfg = JSON.parse(await readFile(configPath(), 'utf8'));
    return cfg && typeof cfg === 'object' ? cfg : null;
  } catch {
    return null;
  }
}

/** Atomic write: temp file then rename, so a crash can't leave a torn config. */
export async function saveConfig(cfg) {
  await mkdir(configDir(), { recursive: true });
  const tmp = configPath() + '.tmp';
  await writeFile(tmp, JSON.stringify({ ...cfg, updatedAt: new Date().toISOString() }, null, 2));
  await rename(tmp, configPath());
}

export async function clearConfig() {
  try { await rm(configPath()); return true; } catch { return false; }
}

/** ghp_ab••••••cd — enough to recognise, not enough to leak. */
export const mask = (k) =>
  (k && k.length > 8) ? `${k.slice(0, 6)}${'•'.repeat(6)}${k.slice(-2)}` : k ? '•'.repeat(8) : null;

/** The OS Downloads dir — the default base for the folder browser. */
export const downloadsDir = () => join(homedir(), 'Downloads');

/** Where wallpapers land if you never touch the dir token. */
export const defaultDir = () => join(downloadsDir(), 'wallgrab');
