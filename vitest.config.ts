import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const watcherFiles = [
  'src/server/ingest/files.test.ts',
  'src/server/watch/jsonfile.test.ts',
  'src/server/watch/tail.test.ts',
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
          // index.wiring.test.ts, Trace.test.tsx and subagents.test.ts only mention fs.watch (a
          // comment, fixture text) and import no watcher, so they stay here, not by grep. The wiring
          // test takes 54s and its spawned server has the reconciliation sweep as a fallback.
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: watcherFiles,
        },
      },
    ],
  },
});
