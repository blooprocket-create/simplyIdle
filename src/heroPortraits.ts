import { ImageSourcePropType } from 'react-native';

const HERO_PORTRAITS: Record<string, ImageSourcePropType> = {
  h4: require('../IMG/HeroIcon/ThornBloodhide.png'),
  h18: require('../IMG/HeroIcon/VarricDoomhowl.png'),
  h25: require('../IMG/HeroIcon/MaeveStormpalm.png'),
  h32: require('../IMG/HeroIcon/ValkyraShieldborn.png'),
  h35: require('../IMG/HeroIcon/VesperSilverbow.png'),
  h44: require('../IMG/HeroIcon/MorgathTerrorforge.png'),
  h47: require('../IMG/HeroIcon/IrisVeilbearer.png'),
  h48: require('../IMG/HeroIcon/ArctusFrostking.png'),
  h50: require('../IMG/HeroIcon/OrionSoulshaper.png'),
  h52: require('../IMG/HeroIcon/SeraphTheInfinite.png'),
  h55: require('../IMG/HeroIcon/ZephyrStarreacher.png'),
  h56: require('../IMG/HeroIcon/NyxVoidChosen.png'),
  h57: require('../IMG/HeroIcon/ArchaonTimeWeaver.png'),
  h58: require('../IMG/HeroIcon/PyritessEternalFlame.png'),
  h60: require('../IMG/HeroIcon/VoidSovereign.png'),
  h64: require('../IMG/HeroIcon/CelestialArchitect.png'),
};

export function getHeroPortraitSource(heroId: string): ImageSourcePropType | null {
  return HERO_PORTRAITS[heroId] ?? null;
}

/** Returns true if the hero has a custom portrait image. */
export function hasHeroPortrait(heroId: string): boolean {
  return heroId in HERO_PORTRAITS;
}

/**
 * Portrait coverage: 16 of 65 heroes have custom art.
 * Heroes still needing portraits (sorted by ID):
 *   h1-h3, h5-h17, h19-h24, h26-h31, h33-h34, h36-h43,
 *   h45-h46, h49, h51, h53-h54, h59, h61-h63, h65
 */