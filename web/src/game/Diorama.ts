import { Engine } from '@babylonjs/core/Engines/engine';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';

import type { SimulationSnapshot } from '../engine/types';
import { ActorPool, type ActorRequest } from './actors/ActorPool';
import { ModelLoader } from './actors/ModelLoader';
import {
  detectCapabilities,
  profileFor,
  qualityFor,
  type DeviceProfile,
  type QualityTier,
} from './device/DeviceProfile';
import { FrameGovernor } from './device/FrameGovernor';
import { isBossWave } from '../content/monsters';
import { CastBars } from './fx/CastBars';
import { DamageNumbers } from './fx/DamageNumbers';
import { HealthBars } from './fx/HealthBars';
import { REACTION_MS, hitFlash, hitRecoil, telegraphPulse } from './fx/reactions';
import { layOutEnemy, layOutHeroes, type Placement } from './layout/battleLine';
import { EMPTY_CAST, type Cast } from './models/cast';
import { EMPTY_MANIFEST, monsterModelKey, type ModelManifest } from './models/manifest';
import { buildStage, type Stage } from './scene/stage';

/**
 * Draws the fight.
 *
 * Two inputs, on purpose. A cast, when the roster changes: who is here, what
 * rank they hold, what model to draw them as. A snapshot, every frame: what
 * they are doing. Identity does not belong in a per-frame message.
 *
 * The rule from Phase 0 is unchanged and is the one that matters — `render`
 * takes a snapshot and draws it. It never decides an outcome, and nothing
 * here calls back into the simulation.
 */

const RANK_TINTS: Record<string, Color3> = {
  front: new Color3(0.44, 0.5, 0.58),
  mid: new Color3(0.38, 0.46, 0.56),
  back: new Color3(0.34, 0.42, 0.54),
};

export interface DioramaOptions {
  manifest?: ModelManifest;
  /** Overrides capability detection; a test or a debug switch supplies it. */
  profile?: DeviceProfile;
}

export class Diorama {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly stage: Stage;
  private readonly loader: ModelLoader;
  private readonly actors: ActorPool;
  private readonly governor: FrameGovernor;
  private readonly damage: DamageNumbers;
  private readonly bars: CastBars;
  private readonly health: HealthBars;
  /** Time since the enemy was last struck. Starts spent, so nothing flashes. */
  private sinceHitMs = REACTION_MS;
  private appliedTier: QualityTier;
  readonly profile: DeviceProfile;

  private cast: Cast = EMPTY_CAST;
  private placements = new Map<string, Placement>();
  private enemyId: string | null = null;

  constructor(canvas: HTMLCanvasElement, options: DioramaOptions = {}) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false });
    this.scene = new Scene(this.engine);

    this.profile = options.profile ?? profileFor(detectCapabilities(globalThis as never));
    this.engine.setHardwareScalingLevel(1 / this.profile.renderScale);
    this.governor = new FrameGovernor(this.profile);

    this.stage = buildStage(this.scene, this.profile);
    this.loader = new ModelLoader(this.scene, options.manifest ?? EMPTY_MANIFEST);
    this.actors = new ActorPool(this.loader);
    this.damage = new DamageNumbers(this.scene, this.profile.maxDamageNumbers);
    this.bars = new CastBars(this.scene);
    this.health = new HealthBars(this.scene);
    this.appliedTier = this.profile.tier;
  }

  /** Which keys the pack could not supply, for a debug overlay or a report. */
  get fallbacks(): ReadonlyMap<string, 'missing' | 'failed'> {
    return this.loader.report.fallbacks;
  }

  /**
   * Swaps the pack without rebuilding the scene. Anything already on the
   * field keeps its current model until the cast changes.
   */
  setManifest(manifest: ModelManifest): void {
    this.loader.setManifest(manifest);
  }

  setCast(cast: Cast): void {
    this.cast = cast;
    this.placements = layOutHeroes(cast);
    this.bars.sync(cast.map(member => member.uid));
    this.syncActors();
  }

  /** Draws the snapshot. Reads only; never writes back into the simulation. */
  render(snapshot: SimulationSnapshot): void {
    const enemyId = snapshot.enemy?.id ?? null;
    if (enemyId !== this.enemyId) {
      this.enemyId = enemyId;
      this.syncActors();
    }

    const decision = this.governor.frame(snapshot.elapsedMs);
    if (decision.tier !== this.appliedTier) this.applyTier(decision.tier);

    // Before the draw decision, not after. A snapshot carries only the hits
    // from its own step, so a skipped frame would drop those numbers on the
    // floor — and skipped frames are exactly when the fight is busiest.
    this.spawnHits(snapshot);
    this.damage.update(decision.stepMs);
    this.sinceHitMs = snapshot.hits.length > 0 ? 0 : this.sinceHitMs + decision.stepMs;
    this.health.tick(snapshot.totals.deaths, decision.stepMs);
    if (!decision.draw) return;

    this.actors.place(this.placements);
    this.health.draw(snapshot.enemy, snapshot.team);
    this.bars.update(this.placements, new Map(snapshot.heroes.map(hero => [hero.uid, hero.swingProgress])));
    this.drawEnemy(snapshot);
    this.scene.render();
  }

  /**
   * Spends the governor's decision.
   *
   * Without this the governor was half a component: it paced frames, decided
   * under load that it wanted a cheaper tier, and then nothing read the
   * answer. Giving up fidelity is the other half of holding a frame rate, and
   * it only counts once something acts on it.
   */
  private applyTier(tier: QualityTier): void {
    this.appliedTier = tier;
    const quality = qualityFor(tier);
    // Never above what the display can show, which the device profile already
    // clamped to the pixel ratio when it was built.
    this.engine.setHardwareScalingLevel(1 / Math.min(quality.renderScale, this.profile.renderScale));
    this.stage.applyQuality(quality.shadows && this.profile.shadows);
    this.damage.setCapacity(quality.maxDamageNumbers);
  }

  /**
   * The enemy, reacting. A struck actor gives ground and flashes; a boss
   * breathes so the wave reads as different before it has done anything.
   *
   * The flash is `renderOverlay` rather than a material edit, because the
   * model comes from a pack and nothing here should be reaching into
   * somebody else's shader to tint it.
   */
  private drawEnemy(snapshot: SimulationSnapshot): void {
    const enemy = this.actors.get(ENEMY_SLOT);
    if (!enemy) return;
    const placement = layOutEnemy();
    const boss = snapshot.enemy !== null && isBossWave(snapshot.enemy.wave);

    enemy.root.position.set(placement.x + hitRecoil(this.sinceHitMs), placement.y, placement.z);
    enemy.root.rotation.y = placement.yaw;
    enemy.root.scaling.setAll(boss ? 1.35 : 1);

    const flash = hitFlash(this.sinceHitMs);
    const pulse = boss ? telegraphPulse(snapshot.elapsedMs) * 0.28 : 0;
    for (const mesh of enemy.root.getChildMeshes()) {
      mesh.renderOverlay = flash > 0.01 || pulse > 0.01;
      mesh.overlayColor = flash >= pulse ? HIT_FLASH_COLOUR : BOSS_TELEGRAPH_COLOUR;
      mesh.overlayAlpha = Math.max(flash * 0.55, pulse);
    }
  }

  private spawnHits(snapshot: SimulationSnapshot): void {
    if (snapshot.hits.length === 0) return;
    const enemy = layOutEnemy();
    for (const hit of snapshot.hits) {
      // Spread along the line the hit came from, so simultaneous swings do
      // not stack into one unreadable smear.
      const jitter = (hashUnit(hit.heroUid) - 0.5) * 2;
      this.damage.spawn(
        hit.dealt,
        new Vector3(enemy.x + jitter * 0.35, 1.5 + jitter * 0.25, enemy.z + jitter * 0.9),
        hit.killed,
      );
    }
  }

  private syncActors(): void {
    const requests: ActorRequest[] = this.cast.map(member => ({
      id: member.uid,
      modelKey: member.modelKey,
      name: member.uid,
      tint: RANK_TINTS[member.role],
    }));
    if (this.enemyId) {
      requests.push({
        // One slot rather than one actor per wave: the enemy is replaced a
        // thousand times a session and each replacement would otherwise
        // rebuild a model that has not changed.
        id: ENEMY_SLOT,
        modelKey: monsterModelKey(this.enemyId),
        name: 'enemy',
        tint: new Color3(0.62, 0.34, 0.28),
      });
    }
    this.actors.sync(requests);
  }

  resize(): void {
    this.engine.resize();
  }

  dispose(): void {
    this.health.dispose();
    this.bars.dispose();
    this.damage.dispose();
    this.actors.dispose();
    this.loader.dispose();
    this.stage.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}

/** The enemy occupies one slot, whatever is standing in it this wave. */
export const ENEMY_SLOT = 'enemy';

const HIT_FLASH_COLOUR = new Color3(1, 0.94, 0.82);
const BOSS_TELEGRAPH_COLOUR = new Color3(0.86, 0.22, 0.24);

/**
 * A stable 0..1 from a uid, so a given hero's numbers always appear in the
 * same place. Random jitter would make the same swing land somewhere new
 * every time, which reads as noise rather than as that hero hitting.
 */
function hashUnit(uid: string): number {
  let hash = 0;
  for (let index = 0; index < uid.length; index += 1) hash = (hash * 31 + uid.charCodeAt(index)) & 0xffff;
  return hash / 0x10000;
}
