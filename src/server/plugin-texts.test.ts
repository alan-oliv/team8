import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Claude Code 2.1.296 runs the body of every plugin skill and command through
// argument substitution whenever it is invoked with arguments: $0, $1… become
// argument words and $ARGUMENTS the whole string, and once anything has been
// substituted the ARGUMENTS footer is dropped, so the arguments never reach the
// model whole. \$ is the escape: "≈$1.15" has to be written "≈\$1.15". A
// backslash that is itself escaped does not count, so "\\$1" is substituted.
const ARGUMENT_WORD = /(?<!(?<!\\)\\)\$\d+(?!\w)/g;
const ALL_ARGUMENTS = /(?<!(?<!\\)\\)\$ARGUMENTS/g;

// enable-team reads the state it sets from $ARGUMENTS, and measure hands them to the CLI.
const TAKES_ARGUMENTS = ['skills/enable-team/SKILL.md', 'commands/measure.md'];

const plugin = new URL('../../plugin/', import.meta.url);
const texts = globSync(['skills/*/SKILL.md', 'commands/*.md'], { cwd: plugin });

// The frontmatter is never substituted, so a $ there reaches the model as
// written, and so would an escape. The split is Claude Code's own.
function bodyMatches(text: string, pattern: RegExp): string[] {
  const body = text.match(/^---\s*\n[\s\S]*?---\s*\n?/)?.[0].length ?? 0;
  return [...text.matchAll(pattern)]
    .filter((match) => match.index >= body)
    .map((match) => `line ${text.slice(0, match.index).split('\n').length}: ${match[0]}`);
}

describe("the plugin's skill and command texts", () => {
  const read = (file: string) => readFileSync(new URL(file, plugin), 'utf8');

  it.each(texts)('%s writes every $ before a digit as \\$', (file) => {
    expect(bodyMatches(read(file), ARGUMENT_WORD)).toEqual([]);
  });

  it.each(texts.filter((file) => !TAKES_ARGUMENTS.includes(file)))('%s has no $ARGUMENTS placeholder', (file) => {
    expect(bodyMatches(read(file), ALL_ARGUMENTS)).toEqual([]);
  });
});
