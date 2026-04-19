/* eslint-disable @typescript-eslint/no-require-imports */
import { AVPlaybackSource } from 'expo-av';

const HERO_ANIMATIONS: Record<string, AVPlaybackSource> = {
  // Tier 5
  h61: require('../IMG/HeroAnimate/TitanWorldrender.mp4'),
};

/** Returns the animated portrait source for a hero, or null if none exists. */
export function getHeroAnimationSource(heroId: string): AVPlaybackSource | null {
  return HERO_ANIMATIONS[heroId] ?? null;
}
