import { createReadStream, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Serve the authored hero portraits straight out of `IMG/HeroIcon` during
 * development, rather than copying them into `web/public`.
 *
 * They are the Expo app's assets and the Expo app still ships; a second copy
 * is 1.7MB of the same paintings drifting out of sync the first time one is
 * repainted. Whatever the diorama ends up doing with them, the source of truth
 * stays in one place.
 *
 * Every file in that directory is named `.png` and is actually a JPEG, so the
 * content type is set from what they are rather than what they are called.
 */
function heroPortraits(): Plugin {
  const root = join(process.cwd(), '..', 'IMG', 'HeroIcon');
  return {
    name: 'hero-portraits',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/^\/next\/heroes\/([A-Za-z0-9_-]+)\.png(?:\?.*)?$/);
        if (!match) return next();
        const file = join(root, `${match[1]}.png`);
        if (!existsSync(file)) return next();
        res.setHeader('Content-Type', extname(file) === '.png' ? 'image/jpeg' : 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), heroPortraits()],
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
