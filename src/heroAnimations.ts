/* eslint-disable @typescript-eslint/no-require-imports */
import { Asset } from 'expo-asset';

const HERO_ANIMATION_MODULES: Record<string, number | string> = {
  // Tier 5
  h61: require('../IMG/HeroAnimate/TitanWorldrender.mp4'),
};

/**
 * Returns a URI for the hero's animated portrait, or null if none exists.
 * Works on both web and native.
 */
export function getHeroAnimationUri(heroId: string): string | null {
  const mod = HERO_ANIMATION_MODULES[heroId];
  if (mod == null) return null;
  // Bundler may resolve to string (URL) or number (asset module ID)
  if (typeof mod === 'string') return mod;
  try {
    const asset = Asset.fromModule(mod);
    return asset.uri || asset.localUri || null;
  } catch {
    return null;
  }
}
