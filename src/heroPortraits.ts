import { ImageSourcePropType } from 'react-native';

const HERO_PORTRAITS: Record<string, ImageSourcePropType> = {
  h32: require('../IMG/HeroIcon/ValkyraShieldborn.png'),
  h44: require('../IMG/HeroIcon/MorgathTerrorforge.png'),
  h47: require('../IMG/HeroIcon/IrisVeilbearer.png'),
};

export function getHeroPortraitSource(heroId: string): ImageSourcePropType | null {
  return HERO_PORTRAITS[heroId] ?? null;
}