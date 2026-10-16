import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// index.wiring.test.ts also touches watchers but only through a spawned server, whose 5s
// reconciliation sweep covers dropped events. It takes 54s alone, so it runs in the parallel
// project to overlap with the rest instead of queueing behind the sequential one.
// It is deliberately parallel: it only mentions fs.watch in a comment, so do not move it back by grep.
const watcherFiles = [
  'src/server/ingest/files.test.ts',
  'src/web/views/Trace.test.tsx',
  'src/server/watch/jsonfile.test.ts',
  'src/server/watch/tail.test.ts',
  'src/shared/subagents.test.ts',
];

const shared = {
  plugins: [react()],
  test: { css: true, environment: 'node' as const },
};

export default defineConfig({
  test: {
    projects: [
      {
        ...shared,
        test: {
          ...shared.test,
          name: 'watchers',
          include: watcherFiles,
          // FS-watcher tests depend on macOS FSEvents delivery, which drops events when many
          // vitest workers compete for them. Production covers this with the 5s reconciliation
          // sweep, but these tests exercise raw watchers which have no fallback.
          fileParallelism: false,
        },
      },
      {
        ...shared,
        test: {
          ...shared.test,
          name: 'parallel',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: watcherFiles,
        },
      },
    ],
  },
});
