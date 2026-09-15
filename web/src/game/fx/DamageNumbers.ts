import type Decimal from 'break_eternity.js';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';

import { formatDamage } from './formatDamage';

/**
 * Damage as it lands: a number that rises off the target and fades.
 *
 * Pooled and capped. A maxed roster swinging every seven hundred milliseconds
 * against a boss produces more of these than anyone can read, and allocating a
 * plane and a texture per hit would spend the frame budget on garbage nobody
 * saw. The cap comes from the device profile, and when it is reached the
 * oldest number is recycled — losing the stalest one rather than refusing the
 * newest, which is the one the player is actually looking at.
 */

export interface DamageNumberStyle {
  /** Normal hits. */
  normal: Color3;
  /** The blow that killed something. */
  killing: Color3;
}

export const DEFAULT_STYLE: DamageNumberStyle = {
  normal: new Color3(0.96, 0.93, 0.82),
  killing: new Color3(1.0, 0.76, 0.33),
};

/** How long a number stays up, and how far it climbs in that time. */
export const LIFETIME_MS = 900;
export const RISE_METRES = 1.1;

/** Babylon's BILLBOARDMODE_ALL. Named so the 7 is not a mystery. */
const BILLBOARD_ALL = 7;

const TEXTURE_WIDTH = 256;
const TEXTURE_HEIGHT = 96;

interface Slot {
  mesh: Mesh;
  material: StandardMaterial;
  texture: DynamicTexture;
  ageMs: number;
  live: boolean;
  origin: Vector3;
}

export class DamageNumbers {
  private readonly slots: Slot[] = [];
  private next = 0;

  constructor(
    private readonly scene: Scene,
    private capacity: number,
    private readonly style: DamageNumberStyle = DEFAULT_STYLE,
  ) {}

  /**
   * Changes the budget when the quality tier moves. Slots above the new cap
   * are released rather than merely ignored — a device that just told us it
   * is struggling should not keep paying for textures it will never show.
   */
  setCapacity(capacity: number): void {
    this.capacity = capacity;
    while (this.slots.length > capacity) {
      const slot = this.slots.pop();
      if (!slot) break;
      slot.mesh.dispose();
      slot.material.dispose();
      slot.texture.dispose();
    }
  }

  spawn(amount: Decimal, at: Vector3, killing = false): void {
    const slot = this.take();
    const context = slot.texture.getContext() as CanvasRenderingContext2D;
    context.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    context.font = 'bold 56px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    // Drawn twice: an outline first, so a pale number stays legible against
    // a pale model as well as against the ground.
    context.lineWidth = 8;
    context.strokeStyle = 'rgba(8,12,18,0.85)';
    context.strokeText(formatDamage(amount), TEXTURE_WIDTH / 2, TEXTURE_HEIGHT / 2);
    context.fillStyle = '#ffffff';
    context.fillText(formatDamage(amount), TEXTURE_WIDTH / 2, TEXTURE_HEIGHT / 2);
    // `update`'s argument is invertY, and it defaults to true for a reason: a
    // canvas draws from the top left and a plane's UVs start at the bottom
    // left. Passing false here is what rendered every number upside down.
    slot.texture.update();

    slot.material.emissiveColor = killing ? this.style.killing : this.style.normal;
    slot.mesh.scaling.setAll(killing ? 1.35 : 1);
    slot.origin.copyFrom(at);
    slot.mesh.position.copyFrom(at);
    slot.ageMs = 0;
    slot.live = true;
    slot.mesh.setEnabled(true);
  }

  update(stepMs: number): void {
    for (const slot of this.slots) {
      if (!slot.live) continue;
      slot.ageMs += stepMs;
      const t = slot.ageMs / LIFETIME_MS;
      if (t >= 1) {
        slot.live = false;
        slot.mesh.setEnabled(false);
        continue;
      }
      slot.mesh.position.y = slot.origin.y + RISE_METRES * t;
      // Holds full strength for the first half, then goes. A number that
      // starts fading immediately is unreadable at the moment it matters.
      slot.material.alpha = t < 0.5 ? 1 : 1 - (t - 0.5) * 2;
    }
  }

  private take(): Slot {
    const free = this.slots.find(slot => !slot.live);
    if (free) return free;
    if (this.slots.length < this.capacity) return this.create();
    // At capacity: reuse in order, which is the oldest still showing.
    const slot = this.slots[this.next % this.slots.length];
    this.next += 1;
    return slot;
  }

  private create(): Slot {
    const index = this.slots.length;
    const texture = new DynamicTexture(
      `damage-${index}`,
      { width: TEXTURE_WIDTH, height: TEXTURE_HEIGHT },
      this.scene,
      false,
    );
    texture.hasAlpha = true;

    const material = new StandardMaterial(`damage-${index}-material`, this.scene);
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    material.opacityTexture = texture;
    material.disableLighting = true;
    material.backFaceCulling = false;
    const mesh = CreatePlane(`damage-${index}`, { width: 1.3, height: 0.5 }, this.scene);
    mesh.material = material;
    mesh.billboardMode = BILLBOARD_ALL;
    mesh.isPickable = false;
    mesh.setEnabled(false);
    const slot: Slot = { mesh, material, texture, ageMs: 0, live: false, origin: new Vector3() };
    this.slots.push(slot);
    return slot;
  }

  dispose(): void {
    for (const slot of this.slots) {
      slot.mesh.dispose();
      slot.material.dispose();
      slot.texture.dispose();
    }
    this.slots.length = 0;
  }
}
