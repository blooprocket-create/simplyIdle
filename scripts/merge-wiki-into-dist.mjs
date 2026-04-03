import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const gameDistDir = resolve('dist');
const wikiBuildDir = resolve('wiki', 'docs', '.vitepress', 'dist');
const wikiDistTargetDir = resolve('dist', 'wiki');

if (!existsSync(gameDistDir)) {
  throw new Error('Missing dist output from Expo web build. Run web export before merge.');
}

if (!existsSync(wikiBuildDir)) {
  throw new Error('Missing wiki build output. Run wiki build before merge.');
}

rmSync(wikiDistTargetDir, { recursive: true, force: true });
mkdirSync(wikiDistTargetDir, { recursive: true });
cpSync(wikiBuildDir, wikiDistTargetDir, { recursive: true });

console.log('Merged wiki build into dist/wiki for single-app Vercel hosting.');
