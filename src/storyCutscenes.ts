/* eslint-disable @typescript-eslint/no-require-imports */
import { Asset } from 'expo-asset';

const STORY_CUTSCENE_MODULES: Record<string, number | string> = {
  prologue_ash: require('../IMG/Cutscene/PrologueAshenSignal.mp4'),
  chapter_1_raiders: require('../IMG/Cutscene/Chapter1TheRaiderAccord.mp4'),
  chapter_2_verdant: require('../IMG/Cutscene/Chapter2RootsoftheCitadel.mp4'),
};

export function hasStoryCutsceneVideo(storyBeatId: string): boolean {
  return storyBeatId in STORY_CUTSCENE_MODULES;
}

export function getStoryCutsceneUri(storyBeatId: string): string | null {
  const mod = STORY_CUTSCENE_MODULES[storyBeatId];
  if (mod == null) return null;
  if (typeof mod === 'string') return mod;

  try {
    const asset = Asset.fromModule(mod);
    return asset.uri || asset.localUri || null;
  } catch {
    return null;
  }
}
