import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BuildInfo } from '../shared/domain';
import { readJsonSafe } from './watch/jsonfile';

/** True when release `running` is older than `candidate`, comparing major.minor.patch as numbers. */
export function isOlderBuild(running: string, candidate: string): boolean {
  const a = running.split('.').map(Number);
  const b = candidate.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}

/**
 * The plugin root a server entry belongs to: the bundle sits at
 * <root>/dist/server/index.js, and a working copy runs <repo>/src/server/index.ts
 * with its plugin at <repo>/plugin.
 */
export function pluginRootOf(entry: string): string {
  const up = path.resolve(path.dirname(entry), '..');
  return path.basename(up) === 'dist' ? path.dirname(up) : path.resolve(up, '..', 'plugin');
}

/** The newest team8 version installed_plugins.json lists, under any marketplace. */
export async function installedVersion(claudeHome: string): Promise<string | undefined> {
  const doc = await readJsonSafe<{ plugins?: Record<string, unknown> }>(
    path.join(claudeHome, 'plugins', 'installed_plugins.json'),
  );
  let newest: string | undefined;
  for (const [key, installs] of Object.entries(doc?.plugins ?? {})) {
    if (!key.startsWith('team8@') || !Array.isArray(installs)) continue;
    for (const install of installs as { version?: unknown }[]) {
      const v = install?.version;
      if (typeof v === 'string' && (newest === undefined || isOlderBuild(newest, v))) newest = v;
    }
  }
  return newest;
}

/** HEAD's commit, short, read from the files so no git process is spawned. */
async function shaOf(repo: string): Promise<string | undefined> {
  try {
    const head = (await fs.readFile(path.join(repo, '.git', 'HEAD'), 'utf8')).trim();
    const ref = /^ref: (.+)$/.exec(head)?.[1];
    const sha = ref ? (await fs.readFile(path.join(repo, '.git', ref), 'utf8')).trim() : head;
    return /^[0-9a-f]{7,}$/.test(sha) ? sha.slice(0, 7) : undefined;
  } catch {
    return undefined;
  }
}

/** An installed build is stale once a newer version is installed; a dev build never is. */
export function withInstalled(info: BuildInfo, installed: string | undefined): BuildInfo {
  return {
    ...info,
    installed,
    stale: info.kind === 'installed' && installed !== undefined && isOlderBuild(info.version, installed),
  };
}

export async function readBuildInfo(entry: string, claudeHome: string): Promise<BuildInfo> {
  const root = pluginRootOf(entry);
  const manifest = await readJsonSafe<{ version?: unknown }>(path.join(root, '.claude-plugin', 'plugin.json'));
  const version = typeof manifest?.version === 'string' ? manifest.version : '0.0.0';
  const kind = root.startsWith(path.join(claudeHome, 'plugins', 'cache') + path.sep) ? 'installed' : 'dev';
  const sha = kind === 'dev' ? await shaOf(path.dirname(root)) : undefined;
  return withInstalled({ version, kind, ...(sha ? { sha } : {}), stale: false }, await installedVersion(claudeHome));
}
