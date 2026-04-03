import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  HERO_POOL,
  EQUIPMENT_CATALOG,
  EQUIPMENT_RARITIES,
  getHeroPassiveTraitInfo,
  getHeroActiveArchetypeInfo,
} from '../../src/gameConfig.ts';

type EquipmentSlot = 'weapon' | 'armor' | 'accessory';

function esc(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function rarityWeightMap(): Record<string, number> {
  return EQUIPMENT_RARITIES.reduce<Record<string, number>>((acc, row) => {
    acc[row.id] = row.dropWeight;
    return acc;
  }, {});
}

function slotLabel(slot: EquipmentSlot): string {
  if (slot === 'weapon') return 'Weapon';
  if (slot === 'armor') return 'Armor';
  return 'Accessory';
}

function writeHeroesPage(outputDir: string): void {
  const rows = HERO_POOL
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(hero => {
      const passive = getHeroPassiveTraitInfo(hero.passiveTrait);
      const active = getHeroActiveArchetypeInfo(hero.activeSkillArchetype);
      return `| ${hero.emoji} ${esc(hero.name)} | ${hero.heroClass} | ${esc(passive.name)} | ${esc(active.name)} | ${(hero.baseTeamBoost * 100).toFixed(1)}% |`;
    });

  const lines = [
    '---',
    'title: Hero Database',
    '---',
    '',
    '# Hero Database',
    '',
    'Status: Live',
    '',
    `Last reviewed: ${new Date().toISOString().slice(0, 10)}`,
    '',
    `Total heroes: ${HERO_POOL.length}`,
    '',
    '| Hero | Class | Passive Trait | Active Archetype | Base Team Boost |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## Truth Sources',
    '',
    '- src/gameConfig.ts',
  ];

  writeFileSync(resolve(outputDir, 'heroes-database.md'), `${lines.join('\n')}\n`, 'utf8');
}

function writeEquipmentPage(outputDir: string): void {
  const weights = rarityWeightMap();
  const rows = EQUIPMENT_CATALOG
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(item => {
      const classes = item.allowedClasses.join(', ');
      const dropWeight = weights[item.rarity] ?? 0;
      const bonus = Object.entries(item.bonus)
        .filter(([, amount]) => typeof amount === 'number' && amount > 0)
        .map(([key, amount]) => `${key}+${amount as number}`)
        .join(', ');
      return `| ${item.emoji} ${esc(item.name)} | ${slotLabel(item.slot as EquipmentSlot)} | ${item.rarity} | ${dropWeight} | ${esc(classes)} | ${esc(bonus || 'None')} |`;
    });

  const lines = [
    '---',
    'title: Equipment Database',
    '---',
    '',
    '# Equipment Database',
    '',
    'Status: Live',
    '',
    `Last reviewed: ${new Date().toISOString().slice(0, 10)}`,
    '',
    `Total equipment items: ${EQUIPMENT_CATALOG.length}`,
    '',
    '| Item | Slot | Rarity | Drop Weight | Allowed Classes | Bonus Stats |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## Rarity Drop Weights',
    '',
    '| Rarity | Weight |',
    '| --- | --- |',
    ...EQUIPMENT_RARITIES.map(row => `| ${row.label} | ${row.dropWeight} |`),
    '',
    '## Truth Sources',
    '',
    '- src/gameConfig.ts',
  ];

  writeFileSync(resolve(outputDir, 'equipment-database.md'), `${lines.join('\n')}\n`, 'utf8');
}

function main(): void {
  const outputDir = resolve(process.cwd(), 'docs');
  mkdirSync(outputDir, { recursive: true });
  writeHeroesPage(outputDir);
  writeEquipmentPage(outputDir);
  // eslint-disable-next-line no-console
  console.log('Generated docs/heroes-database.md and docs/equipment-database.md');
}

main();
