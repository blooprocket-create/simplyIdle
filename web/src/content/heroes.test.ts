import { describe, expect, it } from 'vitest';
import { CLASS_PROFILES, type PlayerClass } from './classes';
import relics from '../engine/combat/__fixtures__/unique-relics.json';
import { HERO_POOL, HERO_TEMPLATE_COUNT, getHeroTemplate, heroTemplatesById } from './heroes';

const CLASSES = new Set(Object.keys(CLASS_PROFILES) as PlayerClass[]);

describe('hero catalogue', () => {
  it('carries the whole shipped roster', () => {
    expect(HERO_POOL).toHaveLength(HERO_TEMPLATE_COUNT);
    expect(HERO_TEMPLATE_COUNT).toBe(65);
  });

  it('has no gap in the id sequence', () => {
    // This is the one that matters most. `SaveContent.heroesById` decides
    // which roster rows survive a migration, and a row whose template id is
    // absent is *dropped* — deliberately, because that is how a retired hero
    // leaves old saves. So a hero missing from this file does not fail
    // loudly; it silently deletes that hero from every save that had one.
    const ids = HERO_POOL.map(hero => hero.id);
    expect(ids).toEqual(Array.from({ length: HERO_TEMPLATE_COUNT }, (_, index) => `h${index + 1}`));
  });

  it("carries every hero's passive trait and skill archetype, as recorded", () => {
    /*
     * Generated from the relic fixture rather than typed, and checked back
     * against it: sixty-five rows of two strings each is exactly the shape a
     * transcription gets wrong quietly, and the symptom would be a hero whose
     * passive multiplier is somebody else's.
     *
     * The fields sat out of this file for four phases on the grounds that no
     * phase read them. Two of the fourteen damage multipliers did, and were
     * unreachable from a real roster for want of them.
     */
    const recorded = new Map(relics.heroes.map(entry => [entry.heroId, entry]));
    expect(recorded.size).toBe(HERO_POOL.length);
    for (const hero of HERO_POOL) {
      const row = recorded.get(hero.id);
      expect({ id: hero.id, trait: hero.passiveTrait, archetype: hero.activeSkillArchetype }).toEqual({
        id: hero.id,
        trait: row?.trait,
        archetype: row?.archetype,
      });
    }
  });

  it('spreads both fields rather than giving everyone the same one', () => {
    // A generator that wrote the first row sixty-five times would pass the
    // check above only if the fixture agreed — but a hand-edit later would
    // not, and a catalogue where every hero shares a trait is a catalogue
    // where the passive multiplier has one value.
    expect(new Set(HERO_POOL.map(hero => hero.passiveTrait)).size).toBeGreaterThan(1);
    expect(new Set(HERO_POOL.map(hero => hero.activeSkillArchetype)).size).toBeGreaterThan(1);
  });

  it('never repeats an id or a name', () => {
    expect(new Set(HERO_POOL.map(hero => hero.id)).size).toBe(HERO_POOL.length);
    expect(new Set(HERO_POOL.map(hero => hero.name)).size).toBe(HERO_POOL.length);
  });

  it('only names classes the engine can act on', () => {
    for (const hero of HERO_POOL) {
      expect(CLASSES.has(hero.heroClass), `${hero.id} is a ${hero.heroClass}`).toBe(true);
    }
  });

  it('keeps every hero inside the five tiers', () => {
    for (const hero of HERO_POOL) {
      expect(hero.tier, hero.id).toBeGreaterThanOrEqual(1);
      expect(hero.tier, hero.id).toBeLessThanOrEqual(5);
    }
    // And uses all of them, or the tier scheme is describing something the
    // catalogue does not actually contain.
    expect(new Set(HERO_POOL.map(hero => hero.tier)).size).toBe(5);
  });

  it('gives every hero a boost the formation maths can use', () => {
    for (const hero of HERO_POOL) {
      expect(Number.isFinite(hero.baseTeamBoost), hero.id).toBe(true);
      expect(hero.baseTeamBoost, hero.id).toBeGreaterThan(0);
      // `SaveHeroTemplate` calls this "the lower bound on a stored boost", so
      // a nonsense value here would let a nonsense value through validation.
      expect(hero.baseTeamBoost, hero.id).toBeLessThan(1);
    }
  });

  it('gives every hero something to show', () => {
    for (const hero of HERO_POOL) {
      expect(hero.name.trim(), hero.id).not.toBe('');
      expect(hero.emoji.trim(), hero.id).not.toBe('');
    }
  });

  it('rises in boost with tier, on the whole', () => {
    // Not per-hero — the shipped values overlap — but a tier 5 hero should
    // not be worth less to a team than a tier 1 one on average, or the
    // summon economy is inverted.
    const mean = (tier: number) => {
      const group = HERO_POOL.filter(hero => hero.tier === tier);
      return group.reduce((total, hero) => total + hero.baseTeamBoost, 0) / group.length;
    };
    expect(mean(5)).toBeGreaterThan(mean(1));
  });

  it('looks a hero up by id, and admits when it cannot', () => {
    expect(getHeroTemplate('h1')?.name).toBe('Kael Ironheart');
    expect(getHeroTemplate('h65')?.tier).toBe(5);
    expect(getHeroTemplate('nobody')).toBeUndefined();
  });

  it('offers the map the save migration validates against', () => {
    const byId = heroTemplatesById();
    expect(byId.size).toBe(HERO_TEMPLATE_COUNT);
    expect(byId.get('h1')).toEqual({ heroClass: 'warrior', baseTeamBoost: HERO_POOL[0].baseTeamBoost });
    // Built fresh, so a caller cannot mutate the catalogue through it.
    expect(heroTemplatesById()).not.toBe(byId);
  });
});
