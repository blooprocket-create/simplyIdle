import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Phase 5 swapped the two web builds: the rewrite answers at the site root
 * and the Expo app moved to /legacy. This file moved with them.
 *
 * The failure mode it guards is still the quiet one. Before the swap, a
 * /next URL falling through to the Expo rule served the *old game* under a
 * new-game address. After it, a /legacy URL falling through to the root rule
 * serves the *new game* under the old game's address — which matters more
 * than it sounds, because /legacy exists so that accounts holding saves
 * behind Firebase can still reach them, and the new game cannot read those.
 *
 * The Expo app is not retired: `eas.json` still builds Android and iOS from
 * the same `src/`. Only which build answers at `/` changed.
 */

interface Rewrite {
  source: string;
  destination: string;
}

const config = JSON.parse(readFileSync(join(__dirname, '..', 'vercel.json'), 'utf8')) as {
  rewrites: Rewrite[];
};
const rewrites = config.rewrites;
const appConfig = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8')) as {
  expo: { experiments?: { baseUrl?: string } };
};

const LEGACY_PREFIX = '/legacy';
const LEGACY_SHELL = '/legacy/index.html';
const ROOT_SHELL = '/index.html';
const isLegacyRule = (rule: Rewrite) => rule.source.startsWith(LEGACY_PREFIX);

describe('deploy routing', () => {
  it('serves the rewrite at the site root', () => {
    const root = rewrites.find(rule => rule.source === '/');
    // Named in the assertion rather than passed to expect: jest, unlike
    // vitest, takes no message argument.
    expect({ source: '/', destination: root?.destination }).toEqual({
      source: '/',
      destination: ROOT_SHELL,
    });
  });

  it('serves the Expo app at the bare /legacy route, with and without a slash', () => {
    for (const source of [LEGACY_PREFIX, `${LEGACY_PREFIX}/`]) {
      const rule = rewrites.find(candidate => candidate.source === source);
      expect({ source, destination: rule?.destination }).toEqual({ source, destination: LEGACY_SHELL });
    }
  });

  it('gives /legacy its own SPA fallback for extension-less paths', () => {
    const fallback = rewrites.find(
      rule => rule.source.startsWith('/legacy/:path') && rule.destination === LEGACY_SHELL,
    );
    // Undefined here means deep links into the old game would 404.
    expect(fallback).toBeDefined();
    // The negative lookahead is what lets asset requests past to real files.
    expect(fallback?.source).toContain('(?!.*\\..*)');
  });

  it('never routes a /legacy path to the new game', () => {
    // The mirror of the leak this file has always guarded, now pointing the
    // other way: a player sent to /legacy is looking for the game that holds
    // their save, and the new one cannot read it.
    const leaks = rewrites.filter(rule => isLegacyRule(rule) && rule.destination === ROOT_SHELL);
    expect(leaks).toEqual([]);
  });

  it('orders every /legacy rule ahead of the root fallback', () => {
    // Vercel evaluates rewrites in order, and the root catch-all matches any
    // extension-less path, /legacy included, so it has to come last.
    const lastLegacy = rewrites.map(isLegacyRule).lastIndexOf(true);
    const firstRoot = rewrites.findIndex(rule => rule.source === '/' || rule.source.startsWith('/:path'));
    expect(lastLegacy).toBeGreaterThanOrEqual(0);
    expect(firstRoot).toBeGreaterThan(lastLegacy);
  });

  it('still lands the rewrite address on the rewrite', () => {
    // /next was where the new game lived for four phases. Links and
    // bookmarks made in that time should not now open the old game.
    for (const source of ['/next', '/next/']) {
      const rule = rewrites.find(candidate => candidate.source === source);
      expect({ source, destination: rule?.destination }).toEqual({ source, destination: ROOT_SHELL });
    }
    const deep = rewrites.find(rule => rule.source.startsWith('/next/:path'));
    expect(deep?.destination).toBe(ROOT_SHELL);
  });

  it('exports the Expo app under the same prefix it is served from', () => {
    /*
     * The coupling that would fail silently. The Expo shell references its
     * own assets absolutely, so the export has to be told it lives under
     * /legacy — otherwise it asks for `/_expo/...`, gets the new game's
     * routing, and renders a blank page at an address that looks fine.
     */
    expect(appConfig.expo.experiments?.baseUrl).toBe(LEGACY_PREFIX);
  });
});
