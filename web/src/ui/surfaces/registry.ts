import type { ComponentType } from 'react';
import { REGISTRY } from '../nav/registry';
import { AchievementsSurface } from './AchievementsSurface';
import { CampaignSurface } from './CampaignSurface';
import { CharacterSurface } from './CharacterSurface';
import { CodexSurface } from './CodexSurface';
import { EquipmentSurface } from './EquipmentSurface';
import { EventsSurface } from './EventsSurface';
import { DungeonsSurface } from './DungeonsSurface';
import { ExpeditionsSurface } from './ExpeditionsSurface';
import { ItemsSurface } from './ItemsSurface';
import { MissionsSurface } from './MissionsSurface';
import { RebirthSurface } from './RebirthSurface';
import { PartySurface } from './PartySurface';
import { RosterSurface } from './RosterSurface';
import { SettingsSurface } from './SettingsSurface';
import { ShopSurface } from './ShopSurface';
import { SummonSurface } from './SummonSurface';
import type { SurfaceProps } from './SurfaceProps';

/**
 * Which destination shows which surface.
 *
 * Deliberately partial. A destination with no entry here falls back to the
 * placeholder, which is the honest state for the ones no phase has built yet —
 * the alternative is eighteen files of invented content, which would make the
 * shell look finished while telling the player nothing.
 *
 * "Adding a feature is one registry entry and nothing else" is the claim the
 * whole structure rests on. This is the second half of that entry: the nav
 * registry says where a thing is filed, this says what it draws.
 */
export const SURFACES: Partial<Record<string, ComponentType<SurfaceProps>>> = {
  achievements: AchievementsSurface,
  character: CharacterSurface,
  equipment: EquipmentSurface,
  items: ItemsSurface,
  rebirth: RebirthSurface,
  party: PartySurface,
  campaign: CampaignSurface,
  roster: RosterSurface,
  codex: CodexSurface,
  missions: MissionsSurface,
  events: EventsSurface,
  dungeons: DungeonsSurface,
  expeditions: ExpeditionsSurface,
  summon: SummonSurface,
  shop: ShopSurface,
  settings: SettingsSurface,
};

export function surfaceFor(id: string): ComponentType<SurfaceProps> | undefined {
  return SURFACES[id];
}

/** Destinations still on the placeholder, so the gap is countable. */
export function unbuiltDestinations(): string[] {
  return REGISTRY.filter(destination => SURFACES[destination.id] === undefined).map(destination => destination.id);
}
