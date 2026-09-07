import { describe, expect, it } from 'vitest';
import { humanizeKey, parseOutput } from './workflow-output';

describe('parseOutput', () => {
  it('reads plain prose as prose, not as failed JSON', () => {
    expect(parseOutput('# Title\n\nSome findings.')).toEqual({
      kind: 'prose',
      text: '# Title\n\nSome findings.',
    });
  });

  it('reads a structured return as sections, keyed by its own fields', () => {
    const doc = parseOutput('{"question":"q","findings":[{"claim":"c"}]}');
    expect(doc).toEqual({
      kind: 'sections',
      value: { question: 'q', findings: [{ claim: 'c' }] },
    });
  });

  it('falls back to beautified JSON for a top-level array or primitive', () => {
    expect(parseOutput('[1,2,3]')).toEqual({ kind: 'json', value: [1, 2, 3] });
    expect(parseOutput('42')).toEqual({ kind: 'json', value: 42 });
  });

  it('treats an empty string as prose, not as a JSON parse failure', () => {
    expect(parseOutput('')).toEqual({ kind: 'prose', text: '' });
  });

  it('flags a flat "stats" field as the KPI row, case-insensitively', () => {
    const doc = parseOutput('{"question":"q","Stats":{"angles":5,"sourcesFetched":22}}');
    expect(doc).toMatchObject({ kind: 'sections', statsKey: 'Stats' });
  });

  it('does not flag "stats" when it holds nested data rather than flat counters', () => {
    const doc = parseOutput('{"stats":{"byPhase":{"a":1}}}');
    expect(doc).toEqual({ kind: 'sections', value: { stats: { byPhase: { a: 1 } } } });
  });

  it('does not flag an empty "stats" object', () => {
    const doc = parseOutput('{"stats":{}}');
    expect(doc).toEqual({ kind: 'sections', value: { stats: {} } });
  });
});

describe('humanizeKey', () => {
  it('spaces camelCase and uppercases', () => {
    expect(humanizeKey('totalTokens')).toBe('TOTAL TOKENS');
  });

  it('turns snake_case and kebab-case into spaced words', () => {
    expect(humanizeKey('source_url')).toBe('SOURCE URL');
    expect(humanizeKey('source-url')).toBe('SOURCE URL');
  });

  it('leaves a single lowercase word as just uppercased', () => {
    expect(humanizeKey('caveats')).toBe('CAVEATS');
  });
});
