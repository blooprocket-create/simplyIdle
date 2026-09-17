import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The site root. Phase 5 swapped the two: the Expo app now answers at
  // /legacy and keeps its native builds, and this owns `/`.
  base: '/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    // Every unit test lives beside its source under `src/`.
    include: ['src/**/*.{test,spec}.ts?(x)'],
  },
});
