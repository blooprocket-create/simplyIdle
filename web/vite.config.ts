import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Served under /next while the Expo app still owns the site root. Phase 5
  // moves this to '/' at cutover.
  base: '/next/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    // Every unit test lives beside its source under `src/`.
    include: ['src/**/*.{test,spec}.ts?(x)'],
  },
});
