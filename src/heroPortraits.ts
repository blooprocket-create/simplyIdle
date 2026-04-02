import { ImageSourcePropType } from 'react-native';

const HERO_PORTRAITS: Record<string, ImageSourcePropType> = {
  h4: require('../IMG/HeroIcon/ThornBloodhide.png'),
  h25: require('../IMG/HeroIcon/MaeveStormpalm.png'),
  h32: require('../IMG/HeroIcon/ValkyraShieldborn.png'),
  h35: require('../IMG/HeroIcon/VesperSilverbow.png'),
  h44: require('../IMG/HeroIcon/MorgathTerrorforge.png'),
  h47: require('../IMG/HeroIcon/IrisVeilbearer.png'),
  h48: require('../IMG/HeroIcon/ArctusFrostking.png'),
  h50: require('../IMG/HeroIcon/OrionSoulshaper.png'),
  h55: require('../IMG/HeroIcon/ZephyrStarreacher.png'),
  h58: require('../IMG/HeroIcon/PyritessEternalFlame.png'),
  h64: require('../IMG/HeroIcon/CelestialArchitect.png'),
};

export function getHeroPortraitSource(heroId: string): ImageSourcePropType | null {
  return HERO_PORTRAITS[heroId] ?? null;
}