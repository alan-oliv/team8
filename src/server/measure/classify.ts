export type Category =
  | 'expensive check'
  | 'build'
  | 'app launch'
  | 'tests'
  | 'typecheck'
  | 'sleep/poll'
  | 'git/gh'
  | 'files'
  | 'task tools'
  | 'messaging'
  | 'subagent'
  | 'other';

// First match wins, so a command chaining several steps lands on its most expensive one.
const BASH_RULES: Array<[Category, RegExp]> = [
  ['expensive check', /npm run package|electron-builder|codesign|lsregister|hdiutil|notarytool|xcodebuild\s+(archive|-exportArchive)|docker build|pkgbuild|productbuild/],
  ['build', /electron-vite build|vite build|esbuild|webpack|npm run build\b|cargo build|go build|tsc -b\b|xcodebuild\b/],
  ['app launch', /remote-debugging|screencapture|osascript|open -[an]\b|\.app\/Contents\/MacOS\/|playwright|puppeteer|npx electron\b/],
  ['tests', /vitest|\bjest\b|pytest|mocha|npm (run )?test\b|go test|cargo test/],
  ['typecheck', /typecheck|tsc --noEmit|\bmypy\b|pyright/],
  ['sleep/poll', /(^|[;&|(\s])sleep \d|\buntil\b.*\bsleep\b|\bwhile\b.*\bsleep\b/],
  ['git/gh', /^\s*(cd [^;&]+(&&|;)\s*)?(\w+=\S+\s+)*(git|gh)\b/],
  ['files', /^\s*(cd [^;&]+(&&|;)\s*)?(cat|sed|grep|rg|find|ls|head|tail|wc|awk|jq|diff|stat|du|tree|sort|uniq|cut|echo|printf)\b/],
];

const TOOL_CATEGORY: Record<string, Category> = {
  Read: 'files', Edit: 'files', Write: 'files', MultiEdit: 'files', NotebookEdit: 'files', Grep: 'files', Glob: 'files',
  TaskGet: 'task tools', TaskUpdate: 'task tools', TaskList: 'task tools', TaskCreate: 'task tools', TodoWrite: 'task tools',
  SendMessage: 'messaging',
  Monitor: 'sleep/poll', BashOutput: 'sleep/poll', TaskOutput: 'sleep/poll', KillShell: 'sleep/poll', TaskStop: 'sleep/poll',
  Agent: 'subagent', Task: 'subagent',
};

export function classifyTool(name: string, input: unknown): Category {
  if (name !== 'Bash') return TOOL_CATEGORY[name] ?? 'other';
  const command = (input as { command?: unknown } | null)?.command;
  if (typeof command !== 'string') return 'other';
  for (const [category, rule] of BASH_RULES) if (rule.test(command)) return category;
  return 'other';
}
