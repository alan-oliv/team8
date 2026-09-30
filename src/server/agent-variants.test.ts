import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENTS_DIR, VARIANTS, variantOf } from './agent-variants';

const read = (name: string) => readFileSync(path.join(AGENTS_DIR, `${name}.md`), 'utf8');
const effortOf = (text: string) => /^effort: (\S+)$/m.exec(text)?.[1];

describe('agent effort variants', () => {
  it('pins the base definitions: executor at medium, reviewer at high', () => {
    expect(effortOf(read('executor'))).toBe('medium');
    expect(effortOf(read('reviewer'))).toBe('high');
  });

  it.each(VARIANTS)('$name is $base with only its name, description and effort changed (run `npm run agents` after editing $base.md)', (v) => {
    expect(read(v.name)).toBe(variantOf(read(v.base), v));
    expect(effortOf(read(v.name))).toBe(v.effort);
  });

  it('rewrites the frontmatter and keeps the body byte for byte', () => {
    const base = '---\nname: executor\ndescription: "does work"\neffort: medium\n---\n\nBody line.\n';
    expect(variantOf(base, { name: 'executor-high', effort: 'high' })).toBe(
      '---\nname: executor-high\ndescription: "does work. Runs at high effort."\neffort: high\n---\n\nBody line.\n',
    );
  });
});
