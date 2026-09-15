import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * While the rewrite lives at /next and the Expo app still owns the site root,
 * the two share one Vercel config. The failure mode this guards is quiet: a
 * /next URL falling through to the Expo SPA rule serves the *old game* under a
 * new-game address, which looks like the rewrite silently regressing rather
 * than like a routing bug.
 *
 * Phase 5 swaps the two and this file goes with the /next prefix.
 */

interface Rewrite {
  source: string;
  destination: string;
}

const config = JSON.parse(readFileSync(join(__dirname, '..', 'vercel.json'), 'utf8')) as {
  rewrites: Rewrite[];
};
const rewrites = config.rewrites;

const isNextRule = (rule: Rewrite) => rule.source.startsWith('/next');
const NEXT_SHELL = '/next/index.html';
const EXPO_SHELL = '/index.html';

describe('deploy routing', () => {
  it('serves the rewrite at the bare /next route, with and without a slash', () => {
    for (const source of ['/next', '/next/']) {
      const rule = rewrites.find(candidate => candidate.source === source);
      // Named in the assertion rather than passed to expect: jest, unlike
      // vitest, takes no message argument.
      expect({ source, destination: rule?.destination }).toEqual({
        source,
        destination: NEXT_SHELL,
      });
    }
  });

  it('gives /next its own SPA fallback for extension-less paths', () => {
    const fallback = rewrites.find(rule => rule.source.startsWith('/next/:path') && rule.destination === NEXT_SHELL);
    // Undefined here means deep links under /next would 404.
    expect(fallback).toBeDefined();
    // The negative lookahead is what lets asset requests past to real files.
    expect(fallback?.source).toContain('(?!.*\\..*)');
  });

  it('never routes a /next path to the Expo shell', () => {
    const leaks = rewrites.filter(rule => isNextRule(rule) && rule.destination === EXPO_SHELL);
    expect(leaks).toEqual([]);
  });

  it('orders every /next rule ahead of the root fallback', () => {
    // Vercel evaluates rewrites in order. The root catch-all matches any
    // extension-less path, /next included, so it has to come last.
    const lastNext = rewrites.map(isNextRule).lastIndexOf(true);
    const firstRoot = rewrites.findIndex(rule => !isNextRule(rule));
    expect(lastNext).toBeGreaterThanOrEqual(0);
    expect(firstRoot).toBeGreaterThan(lastNext);
  });

  it('keeps the Expo app on the site root until cutover', () => {
    const root = rewrites.find(rule => rule.source === '/');
    expect(root?.destination).toBe(EXPO_SHELL);
  });
});
