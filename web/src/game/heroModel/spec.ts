/**
 * What a hero looks like, as data.
 *
 * Every hero has authored portrait art, and a capsule throws away identity
 * that is already drawn and paid for. There is no sculpting tool here and no
 * image-to-3D, so the portraits cannot become meshes directly — but they can
 * be *read*, and what is read can be written down: build, armour, headgear,
 * weapon, the colours. A figure assembled from primitives against those
 * parameters is not the painting, but it is recognisably the same character,
 * which is what the battle line needs.
 *
 * Authored per hero by looking at their portrait, then checked by rendering it
 * and comparing. See `scripts/renderHeroModels.mjs`.
 */

export type Build = 'slight' | 'average' | 'broad' | 'huge';
export type ArmourKind = 'cloth' | 'leather' | 'mail' | 'plate';
export type HairStyle = 'bald' | 'short' | 'long' | 'topknot' | 'wild';
export type HeadGear = 'none' | 'hood' | 'helm' | 'horned' | 'crown';
export type WeaponKind = 'none' | 'sword' | 'greatsword' | 'axe' | 'staff' | 'bow' | 'spear' | 'fists';
export type OffhandKind = 'none' | 'kite' | 'round' | 'tower' | 'orb';
export type LegStyle = 'robe' | 'trousers' | 'greaves';

export interface HeroModelSpec {
  heroId: string;
  name: string;
  build: Build;
  /** Metres, head to heel. An average adult here is 1.8. */
  height: number;
  skin: string;
  hair: { style: HairStyle; colour: string };
  /** Facial hair, drawn as a wedge under the jaw. */
  beard?: { colour: string; length: number };
  head: { gear: HeadGear; colour?: string };
  torso: { armour: ArmourKind; primary: string; secondary: string };
  /** Shoulder volumes. `spikes` breaks the outline, which is how tier reads. */
  pauldrons: { size: number; spikes: number; colour: string };
  cloak?: { colour: string; length: number };
  legs: { style: LegStyle; colour: string };
  weapon: { kind: WeaponKind; length: number; colour: string; glow?: string };
  offhand: { kind: OffhandKind; colour: string; trim?: string };
  /** Self-lit accents. Higher tiers carry more, and orbit debris. */
  emissive?: { colour: string; intensity: number; orbits: number };
}

export const BUILD_WIDTH: Record<Build, number> = {
  slight: 0.82,
  average: 1,
  broad: 1.22,
  huge: 1.45,
};
