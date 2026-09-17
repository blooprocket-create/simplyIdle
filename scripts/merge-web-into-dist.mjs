import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Assembles the deployed site: the rewrite at the root, the Expo app at
 * /legacy.
 *
 * Before Phase 5 this was the other way round — the Expo app owned the root
 * and the rewrite was published under /next. This script is the swap.
 *
 * **The Expo app is not retired.** It keeps its own native path: `eas.json`
 * still builds the Android and iOS apps from the same `src/`, and nothing
 * here touches that. What moves is only which of the two web builds answers
 * at `/`.
 *
 * It stays reachable on the web for a concrete reason rather than sentiment:
 * there are inactive accounts holding real saves, those saves live behind
 * Firebase, and the rewrite reads local storage only. Until `ports/SavePort`
 * has a Firebase adapter, /legacy is the only way those players reach their
 * own game.
 *
 * The two builds cannot simply be overlaid. Expo emits `assets/` and so does
 * Vite, so one would bury the other — which is why the Expo export sets
 * `expo.experiments.baseUrl` to `/legacy` in `app.json` and lands entirely
 * inside its own directory.
 */
const dist = resolve('dist');
const staging = resolve('dist-legacy-staging');
const webBuild = resolve('web', 'dist');

if (!existsSync(dist)) {
  throw new Error('Missing Expo web export. Run `expo export --platform web` before merge.');
}
if (!existsSync(webBuild)) {
  throw new Error('Missing web build output. Run the web build before merge.');
}

/*
 * Staged through a sibling directory rather than copied into a child of
 * itself: `dist/legacy` under a recursive copy of `dist` is how a build
 * script eats its own output.
 */
rmSync(staging, { recursive: true, force: true });
renameSync(dist, staging);

mkdirSync(dist, { recursive: true });
cpSync(webBuild, dist, { recursive: true });
cpSync(staging, resolve(dist, 'legacy'), { recursive: true });
rmSync(staging, { recursive: true, force: true });

console.log('Assembled dist: rewrite at /, Expo app at /legacy.');
