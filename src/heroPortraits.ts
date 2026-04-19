/* eslint-disable @typescript-eslint/no-require-imports */
import { ImageSourcePropType } from 'react-native';

const HERO_PORTRAITS: Record<string, ImageSourcePropType> = {
  // Tier 1
  h1: require('../IMG/HeroIcon/KaelIronheart.png'),
  h2: require('../IMG/HeroIcon/MiraOathguard.png'),
  h3: require('../IMG/HeroIcon/DroganAshfury.png'),
  h4: require('../IMG/HeroIcon/ThornBloodhide.png'),
  h5: require('../IMG/HeroIcon/SylviWindmark.png'),
  h6: require('../IMG/HeroIcon/RivenHawkeye.png'),
  h7: require('../IMG/HeroIcon/LunaraFrostweave.png'),
  h8: require('../IMG/HeroIcon/AzielEmbermind.png'),
  h9: require('../IMG/HeroIcon/ShenDawnfist.png'),
  h10: require('../IMG/HeroIcon/IriaLotusveil.png'),
  h11: require('../IMG/HeroIcon/BorinStonewall.png'),
  h12: require('../IMG/HeroIcon/KarraRageborn.png'),
  h13: require('../IMG/HeroIcon/NyxWhisperleaf.png'),
  h14: require('../IMG/HeroIcon/VexStarchant.png'),
  h15: require('../IMG/HeroIcon/TarinSunstep.png'),
  h16: require('../IMG/HeroIcon/OrinBastionforge.png'),
  h17: require('../IMG/HeroIcon/SeleneIronbanner.png'),
  h18: require('../IMG/HeroIcon/VarricDoomhowl.png'),
  h19: require('../IMG/HeroIcon/MorgaChainstorm.png'),
  h20: require('../IMG/HeroIcon/AelaWindpierce.png'),
  h21: require('../IMG/HeroIcon/KestrelMoonshot.png'),
  h22: require('../IMG/HeroIcon/SerisRiftborn.png'),
  h23: require('../IMG/HeroIcon/NoctisEmberveil.png'),
  h24: require('../IMG/HeroIcon/KorinStillwater.png'),
  h25: require('../IMG/HeroIcon/MaeveStormpalm.png'),
  h26: require('../IMG/HeroIcon/GideonFlamecrest.png'),
  h27: require('../IMG/HeroIcon/RookAshrender.png'),
  h28: require('../IMG/HeroIcon/LyraStarquill.png'),
  h29: require('../IMG/HeroIcon/EldrinPalefire.png'),
  h30: require('../IMG/HeroIcon/JinHollowreed.png'),
  // Tier 2
  h31: require('../IMG/HeroIcon/ThorsIronpeak.png'),
  h32: require('../IMG/HeroIcon/ValkyraShieldborn.png'),
  h33: require('../IMG/HeroIcon/BrutusIronjaw.png'),
  h34: require('../IMG/HeroIcon/MagusStonereave.png'),
  h35: require('../IMG/HeroIcon/VesperSilverbow.png'),
  h36: require('../IMG/HeroIcon/FenwickSwiftbrand.png'),
  h37: require('../IMG/HeroIcon/ThaliaDuskborn.png'),
  h38: require('../IMG/HeroIcon/CorvusNightwhisper.png'),
  h39: require('../IMG/HeroIcon/KalenDawnbringer.png'),
  h40: require('../IMG/HeroIcon/SeraVeilwanderer.png'),
  // Tier 3
  h41: require('../IMG/HeroIcon/KarthusSoulforge.png'),
  h42: require('../IMG/HeroIcon/AzuraDawnbearer.png'),
  h43: require('../IMG/HeroIcon/ViktorDarkbane.png'),
  h44: require('../IMG/HeroIcon/MorgathTerrorforge.png'),
  h45: require('../IMG/HeroIcon/ZaraVoidarchress.png'),
  h46: require('../IMG/HeroIcon/KastorDeathmark.png'),
  h47: require('../IMG/HeroIcon/IrisVeilbearer.png'),
  h48: require('../IMG/HeroIcon/ArctusFrostking.png'),
  h49: require('../IMG/HeroIcon/SorenaLightfury.png'),
  h50: require('../IMG/HeroIcon/OrionSoulshaper.png'),
  // Tier 4
  h51: require('../IMG/HeroIcon/AethermawUnbounded.png'),
  h52: require('../IMG/HeroIcon/SeraphTheInfinite.png'),
  h53: require('../IMG/HeroIcon/RagnarHellborn.png'),
  h54: require('../IMG/HeroIcon/VyxaraShadowEmpress.png'),
  h55: require('../IMG/HeroIcon/ZephyrStarreacher.png'),
  h56: require('../IMG/HeroIcon/NyxVoidChosen.png'),
  h57: require('../IMG/HeroIcon/ArchaonTimeWeaver.png'),
  h58: require('../IMG/HeroIcon/PyritessEternalFlame.png'),
  h59: require('../IMG/HeroIcon/LuminionStellarch.png'),
  h60: require('../IMG/HeroIcon/VoidSovereign.png'),
  // Tier 5
  h61: require('../IMG/HeroIcon/TitanWorldrender.png'),
  h62: require('../IMG/HeroIcon/LeviathanDepths.png'),
  h63: require('../IMG/HeroIcon/PhoenixEternal.png'),
  h64: require('../IMG/HeroIcon/CelestialArchitect.png'),
  h65: require('../IMG/HeroIcon/DharmaEternalCycle.png'),
};

export function getHeroPortraitSource(heroId: string): ImageSourcePropType | null {
  return HERO_PORTRAITS[heroId] ?? null;
}

/** Returns true if the hero has a custom portrait image. */
export function hasHeroPortrait(heroId: string): boolean {
  return heroId in HERO_PORTRAITS;
}

/**
 * Portrait coverage: 65 of 65 heroes have custom art (100%).
 */
