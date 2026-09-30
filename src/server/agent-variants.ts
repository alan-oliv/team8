import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The Agent tool has no effort parameter, and an agent without `effort` in its
// definition inherits the lead's /effort, so each effort a task can ask for is its
// own definition: a copy of its base file with only the frontmatter changed.
export const VARIANTS = [
  { base: 'executor', name: 'executor-low', effort: 'low' },
  { base: 'executor', name: 'executor-high', effort: 'high' },
  { base: 'executor', name: 'executor-xhigh', effort: 'xhigh' },
  { base: 'reviewer', name: 'reviewer-light', effort: 'medium' },
];

export const AGENTS_DIR = fileURLToPath(new URL('../../plugin/agents/', import.meta.url));

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;

export function variantOf(base: string, variant: { name: string; effort: string }): string {
  const m = FRONTMATTER.exec(base);
  if (!m) throw new Error('agent definition has no frontmatter');
  const lines = m[1]
    .split('\n')
    .filter((line) => !line.startsWith('effort:'))
    .map((line) => {
      if (line.startsWith('name:')) return `name: ${variant.name}`;
      if (line.startsWith('description:')) return line.replace(/"$/, `. Runs at ${variant.effort} effort."`);
      return line;
    });
  return `---\n${[...lines, `effort: ${variant.effort}`].join('\n')}\n---\n${base.slice(m[0].length)}`;
}

export function writeVariants(dir = AGENTS_DIR): void {
  for (const v of VARIANTS) {
    writeFileSync(path.join(dir, `${v.name}.md`), variantOf(readFileSync(path.join(dir, `${v.base}.md`), 'utf8'), v));
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) writeVariants();
