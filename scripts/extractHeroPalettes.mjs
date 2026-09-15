import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';

/**
 * Derive each hero's placeholder palette from their authored portrait.
 *
 * Phase 2 builds hero placeholders out of primitives, and a primitive needs a
 * colour. Picking sixty-five colours by hand would be sixty-five chances to
 * drift away from art that already exists and is already paid for, so the
 * colours are read out of the portraits instead: the hue is the artist's, and
 * only the lightness and saturation are normalised to something that reads on
 * a lit mesh.
 *
 * Not run in CI. The output is committed; re-run it deliberately when the
 * portraits change:
 *
 *   npm i -D jpeg-js && node scripts/extractHeroPalettes.mjs
 *
 * A note for whoever does: every file in `IMG/HeroIcon` is named `.png` and is
 * actually a JPEG — all sixty-five of them. React Native's bundler and every
 * browser sniff the content rather than trusting the extension, so nothing is
 * broken today, but a stricter loader would be entitled to reject them and
 * this script decodes them as what they are rather than what they are called.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}
function hslToHex(h, s, l) {
  const f = n => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
}
const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

function palette(file) {
  const raw = jpeg.decode(readFileSync(file), { useTArray: true });
  const { width: W, height: H, data } = raw;
  /*
   * Crop to the torso, not the whole frame. The face dominates the upper
   * third and its skin tones are not identity; the outer band is moody
   * background, and the tier-5 portraits put a glowing backdrop right behind
   * the figure — Titan Worldrender's first pass returned the pale blue of his
   * moon rather than anything he was wearing.
   */
  const x0 = Math.floor(W * 0.26), x1 = Math.floor(W * 0.74);
  const y0 = Math.floor(H * 0.42), y1 = Math.floor(H * 0.95);

  // Coarse HSL buckets, weighted by saturation so identity colour beats grey.
  const buckets = new Map();
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * W + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const [h, s, l] = rgbToHsl(r, g, b);
      if (l < 0.12 || l > 0.93) continue;   // crush blacks and blown highlights
      if (s < 0.16) continue;               // drop near-greys
      // Weight toward frame centre: the figure is centred, the backdrop is not.
      const cx = (x - (x0 + x1) / 2) / ((x1 - x0) / 2);
      const centreWeight = Math.max(0.15, 1 - cx * cx);
      const key = `${Math.floor(h * 24)}|${Math.floor(s * 4)}|${Math.floor(l * 5)}`;
      const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0, w: 0, h, s: 0, l: 0 };
      e.n++; e.r += r; e.g += g; e.b += b; e.w += s * s * centreWeight; e.s += s; e.l += l;
      buckets.set(key, e);
    }
  }

  const ranked = [...buckets.values()].sort((a, b) => b.w - a.w);
  const picked = [];
  for (const e of ranked) {
    // Keep hues that are actually distinct from what we already took.
    if (picked.some(p => { const d = Math.abs(p.h - e.h); return Math.min(d, 1 - d) < 0.08; })) continue;
    picked.push(e);
    if (picked.length === 4) break;
  }
  if (!picked.length) return null;
  /*
   * Keep the hue the artist chose; normalise lightness and saturation into a
   * band that actually reads on a lit 3D primitive. The raw means come back
   * around 12% lightness, because these are dark moody paintings — a material
   * that colour is indistinguishable from the shadow it sits in.
   */
  const usable = e => {
    const [h] = rgbToHsl(e.r / e.n, e.g / e.n, e.b / e.n);
    const s = Math.min(0.85, Math.max(0.45, e.s / e.n * 1.6));
    const l = Math.min(0.62, Math.max(0.42, e.l / e.n * 1.7));
    return hslToHex(h, s, l);
  };
  // Candidates, not a decision. Which of these is a hero's *identity* colour
  // cannot be known from their own portrait alone — see the selection below.
  const total = picked.reduce((sum, e) => sum + e.w, 0);
  return picked.map(e => ({
    hue: rgbToHsl(e.r / e.n, e.g / e.n, e.b / e.n)[0],
    prominence: e.w / total,
    hex: usable(e),
    raw: hex(e.r / e.n, e.g / e.n, e.b / e.n),
  }));
}

// hero id -> name/class/tier, and id -> portrait file
const src = readFileSync(join(ROOT, 'src/gameConfig.ts'), 'utf8');
const pool = src.slice(src.indexOf('export const HERO_POOL'));
const rx = /id: '(h\d+)',\s*name: '([^']+)',\s*heroClass: '(\w+)',[\s\S]*?tier: (\d)/g;
const heroes = [];
let m; while ((m = rx.exec(pool))) heroes.push({ id: m[1], name: m[2], heroClass: m[3], tier: +m[4] });

const portraitSrc = readFileSync(join(ROOT, 'src/heroPortraits.ts'), 'utf8');
const files = {};
const px = /(h\d+): require\('\.\.\/IMG\/HeroIcon\/([^']+)'\)/g;
let p; while ((p = px.exec(portraitSrc))) files[p[1]] = p[2];

const candidates = [];
for (const hero of heroes) {
  const file = files[hero.id];
  if (!file) { console.error('no portrait for', hero.id); continue; }
  candidates.push({ ...hero, portrait: file, options: palette(join(ROOT, 'IMG/HeroIcon', file)) });
}

/*
 * Pick each hero's colour by what is *rare across the roster*, not by what is
 * most of their own portrait.
 *
 * Ranking by in-portrait dominance alone gave almost every tier-one hero the
 * same leather brown, because that is the shared palette of the art
 * direction — true of the paintings, and useless for telling six heroes on a
 * battle line apart. Scoring a candidate by prominence divided by how common
 * its hue is across all sixty-five surfaces what is distinctive instead: the
 * green of Kael's gambeson rather than the brown of everyone's straps.
 */
const HUE_BINS = 24;
const histogram = new Array(HUE_BINS).fill(0);
for (const hero of candidates) {
  for (const option of hero.options) histogram[Math.floor(option.hue * HUE_BINS) % HUE_BINS] += option.prominence;
}
const rarity = option => 1 / (histogram[Math.floor(option.hue * HUE_BINS) % HUE_BINS] + 0.5);

const out = candidates.map(hero => {
  const scored = [...hero.options].sort((a, b) => b.prominence * rarity(b) - a.prominence * rarity(a));
  const accent = scored[0];
  const secondary =
    scored.find(option => {
      const d = Math.abs(option.hue - accent.hue);
      return Math.min(d, 1 - d) > 0.08;
    }) ?? accent;
  return {
    id: hero.id,
    name: hero.name,
    heroClass: hero.heroClass,
    tier: hero.tier,
    portrait: hero.portrait,
    accent: accent.hex,
    secondary: secondary.hex,
  };
});

const distinct = new Set(out.map(h => h.accent)).size;
console.log(`accent colours: ${distinct} distinct across ${out.length} heroes`);
for (const h of out.filter(h => ['h1', 'h2', 'h7', 'h8', 'h9', 'h61', 'h63'].includes(h.id)))
  console.log(`  ${h.id.padEnd(4)} ${h.name.padEnd(24)} T${h.tier} ${h.heroClass.padEnd(10)} ${h.accent} / ${h.secondary}`);
const rows = out
  .map(h => `  ${h.id}: { accent: '${h.accent}', secondary: '${h.secondary}', tier: ${h.tier} },`)
  .join('\n');

const file = `import type { PlayerClass } from './classes';

/**
 * Placeholder palettes, read out of each hero's authored portrait.
 *
 * GENERATED by \`scripts/extractHeroPalettes.mjs\` — edit that, not this.
 *
 * Phase 2 builds hero placeholders from primitives, and the silhouette comes
 * from class crossed with tier: twenty-five combinations across sixty-five
 * heroes, so up to six heroes share an outline. Colour is what tells those six
 * apart, and taking it from the portrait means the thing a player recognises
 * on the battle line is the thing the artist drew — Kael Ironheart's green
 * gambeson, Lunara Frostweave's olive cloak, Titan Worldrender's purple.
 *
 * Hue is the artist's. Lightness and saturation are normalised into a band
 * that reads on a lit mesh, because the portraits are dark moody paintings and
 * their literal mean colour sits around twelve percent lightness — a material
 * that colour is indistinguishable from the shadow it stands in.
 */

export interface HeroPalette {
  /** The identity colour: clothing, cloak or armour trim. */
  accent: string;
  /** A second distinct hue from the same portrait, for secondary volumes. */
  secondary: string;
  /** 1 to 5. Drives how elaborate the placeholder is; see heroSilhouettes.ts. */
  tier: number;
}

export const HERO_PALETTES: Record<string, HeroPalette> = {
\n${rows}
};

/** Neutral fall-back for a hero id with no portrait on record. */
export const DEFAULT_HERO_PALETTE: HeroPalette = { accent: '#8a8f98', secondary: '#5d6068', tier: 1 };

export function getHeroPalette(heroId: string): HeroPalette {
  return HERO_PALETTES[heroId] ?? DEFAULT_HERO_PALETTE;
}

/** Every class a placeholder can be built for, for exhaustiveness checks. */
export const PLACEHOLDER_CLASSES: readonly PlayerClass[] = ['warrior', 'berserker', 'archer', 'mage', 'monk'];
`;

writeFileSync(join(ROOT, 'web/src/content/heroPalettes.ts'), file);
console.log('wrote web/src/content/heroPalettes.ts with', out.length, 'heroes');
