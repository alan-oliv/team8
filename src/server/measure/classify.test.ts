import { describe, expect, it } from 'vitest';
import { classifyTool } from './classify';

describe('classifyTool', () => {
  it('names a Bash command by its most expensive step', () => {
    expect(classifyTool('Bash', { command: 'npm run typecheck && npm run package > log 2>&1' })).toBe('expensive check');
    expect(classifyTool('Bash', { command: 'cd ~/app && npx electron-vite build --outDir /tmp/out' })).toBe('build');
    expect(classifyTool('Bash', { command: 'npx vitest run src/a.ts && npx tsc --noEmit' })).toBe('tests');
    expect(classifyTool('Bash', { command: 'npm run typecheck' })).toBe('typecheck');
    expect(classifyTool('Bash', { command: 'osascript -e \'quit app "x"\'' })).toBe('app launch');
  });

  it('gives waits, git and plain file commands their own kinds', () => {
    expect(classifyTool('Bash', { command: 'sleep 5; date' })).toBe('sleep/poll');
    expect(classifyTool('Bash', { command: 'until [ -f done ]; do sleep 2; done' })).toBe('sleep/poll');
    expect(classifyTool('Bash', { command: 'ALANIZED=1 gh pr create --title x' })).toBe('git/gh');
    expect(classifyTool('Bash', { command: 'cd repo && git log --oneline -3' })).toBe('git/gh');
    expect(classifyTool('Bash', { command: 'grep -n foo src/a.ts' })).toBe('files');
    expect(classifyTool('Bash', { command: 'python3 analyze.py' })).toBe('other');
  });

  it('maps the other tools by name', () => {
    expect(classifyTool('Read', { file_path: '/a' })).toBe('files');
    expect(classifyTool('TaskUpdate', {})).toBe('task tools');
    expect(classifyTool('SendMessage', {})).toBe('messaging');
    expect(classifyTool('Agent', {})).toBe('subagent');
    expect(classifyTool('WebFetch', {})).toBe('other');
  });
});
