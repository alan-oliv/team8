import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installedVersion, isOlderBuild, pluginRootOf, readBuildInfo, withInstalled } from './build-info';

let home: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'build-info-'));
});

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value));
}

describe('isOlderBuild', () => {
  it('compares releases numerically, not as text', () => {
    expect(isOlderBuild('1.0.9', '1.0.10')).toBe(true);
    expect(isOlderBuild('1.0.10', '1.0.9')).toBe(false);
    expect(isOlderBuild('1.2.0', '2.0.0')).toBe(true);
  });

  it('is false for the same release', () => {
    expect(isOlderBuild('1.0.43', '1.0.43')).toBe(false);
  });

  it('is false when either side is not a release', () => {
    expect(isOlderBuild('dev', '1.0.44')).toBe(false);
    expect(isOlderBuild('1.0.44', 'dev')).toBe(false);
  });
});

describe('pluginRootOf', () => {
  it('finds the plugin root above the bundled server', () => {
    expect(pluginRootOf('/p/cache/team8/1.0.43/dist/server/index.js')).toBe('/p/cache/team8/1.0.43');
  });

  it("finds a working copy's plugin folder from the source entry", () => {
    expect(pluginRootOf('/code/team8/src/server/index.ts')).toBe('/code/team8/plugin');
  });
});

describe('installedVersion', () => {
  it('is the newest team8 install under any marketplace', async () => {
    await writeJson(path.join(home, 'plugins', 'installed_plugins.json'), {
      plugins: {
        'team8@team8': [{ version: '1.0.41' }],
        'team8@grimoire': [{ version: '1.0.43' }],
        'other@grimoire': [{ version: '9.9.9' }],
      },
    });

    expect(await installedVersion(home)).toBe('1.0.43');
  });

  it('is undefined when nothing lists team8', async () => {
    expect(await installedVersion(home)).toBeUndefined();
  });
});

describe('readBuildInfo', () => {
  it('reads an installed build and marks it stale when a newer one is installed', async () => {
    const root = path.join(home, 'plugins', 'cache', 'grimoire', 'team8', '1.0.42');
    await writeJson(path.join(root, '.claude-plugin', 'plugin.json'), { version: '1.0.42' });
    await writeJson(path.join(home, 'plugins', 'installed_plugins.json'), {
      plugins: { 'team8@grimoire': [{ version: '1.0.43' }] },
    });

    expect(await readBuildInfo(path.join(root, 'dist', 'server', 'index.js'), home)).toEqual({
      version: '1.0.42',
      kind: 'installed',
      installed: '1.0.43',
      stale: true,
    });
  });

  it('reads a working copy as dev with its commit, and never stale', async () => {
    const repo = path.join(home, 'repo');
    await writeJson(path.join(repo, 'plugin', '.claude-plugin', 'plugin.json'), { version: '1.0.44' });
    await fs.mkdir(path.join(repo, '.git', 'refs', 'heads'), { recursive: true });
    await fs.writeFile(path.join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    await fs.writeFile(path.join(repo, '.git', 'refs', 'heads', 'main'), '0123456789abcdef0123456789abcdef01234567\n');
    await writeJson(path.join(home, 'plugins', 'installed_plugins.json'), {
      plugins: { 'team8@grimoire': [{ version: '1.0.99' }] },
    });

    const info = await readBuildInfo(path.join(repo, 'src', 'server', 'index.ts'), home);

    expect(info).toMatchObject({ version: '1.0.44', kind: 'dev', sha: '0123456', stale: false });
  });
});

describe('withInstalled', () => {
  it('clears stale once the installed version catches up', () => {
    const stale = { version: '1.0.42', kind: 'installed' as const, installed: '1.0.43', stale: true };
    expect(withInstalled(stale, '1.0.42')).toEqual({ version: '1.0.42', kind: 'installed', installed: '1.0.42', stale: false });
  });
});
