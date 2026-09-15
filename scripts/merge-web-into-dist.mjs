import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Publishes the Phase 0+ rewrite under /next, alongside the Expo app that
 * still owns the site root. Phase 5 swaps them.
 */
const buildDir = resolve('web', 'dist');
const targetDir = resolve('dist', 'next');

if (!existsSync(buildDir)) {
  throw new Error('Missing web build output. Run the web build before merge.');
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });
cpSync(buildDir, targetDir, { recursive: true });

console.log('Merged web build into dist/next.');
