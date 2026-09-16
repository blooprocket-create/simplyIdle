import { describe, expect, it } from 'vitest';
import { ENEMY_BAR, ENEMY_POSITION, RANK_X, TEAM_BAR, TEAM_BAR_X } from './battleLine';
import {
  FIGHT_BOUNDS,
  LANDSCAPE_ASPECT,
  PORTRAIT_ASPECT,
  boundsCorners,
  framingAngle,
  framingRadius,
  screenPositionOf,
} from './framing';

const FOV = 0.8;
const BETA = Math.PI / 2.7;
const TARGET = { x: -0.8, y: 1, z: 0 };
const CORNERS = boundsCorners(FIGHT_BOUNDS);

const ASPECTS = [0.35, 0.46, 0.55, 0.75, 1, 1.4, 1.78, 2.05, 2.4, 3.2];

/** Everything the shot must contain, in normalised frustum units. */
function worstCorner(aspect: number, radius: number) {
  const view = { target: TARGET, alpha: -Math.PI / 2 + framingAngle(aspect), beta: BETA, radius, fov: FOV, aspect };
  let worstX = 0;
  let worstY = 0;
  for (const corner of CORNERS) {
    const at = screenPositionOf(corner, view);
    worstX = Math.max(worstX, Math.abs(at.x));
    worstY = Math.max(worstY, Math.abs(at.y));
  }
  return { worstX, worstY };
}

describe('framing', () => {
  it('holds every corner of the fight inside the frame, at every viewport shape', () => {
    // The bug this exists for, twice over. Babylon holds the *vertical* field
    // fixed, so a portrait phone saw less than half the line. And the first
    // fix assumed the shot was symmetric about its target, which it is not
    // once the camera swings off the axis: the near end of the line subtends
    // a far wider angle than the far end, and the enemy's health bar ran off
    // the right edge on a desktop that had been fine before.
    for (const aspect of ASPECTS) {
      const radius = framingRadius({ target: TARGET, beta: BETA, fov: FOV, aspect });
      const { worstX, worstY } = worstCorner(aspect, radius);
      expect(worstX, `aspect ${aspect} horizontally`).toBeLessThanOrEqual(1);
      expect(worstY, `aspect ${aspect} vertically`).toBeLessThanOrEqual(1);
    }
  });

  it('does not stand further back than it has to', () => {
    // Fitting is trivial from a mile away. The shot should be the closest
    // one that still fits, or the cast is ants on every screen.
    for (const aspect of ASPECTS) {
      const radius = framingRadius({ target: TARGET, beta: BETA, fov: FOV, aspect });
      const { worstX, worstY } = worstCorner(aspect, radius * 0.9);
      expect(Math.max(worstX, worstY), `aspect ${aspect}`).toBeGreaterThan(1);
    }
  });

  it('pulls back as the viewport narrows, never closer', () => {
    // A distance that dipped in the middle would be a window width at which
    // the line pops in and out of frame as it is dragged.
    let previous = -Infinity;
    for (const aspect of [...ASPECTS].reverse()) {
      const radius = framingRadius({ target: TARGET, beta: BETA, fov: FOV, aspect });
      expect(radius, `aspect ${aspect}`).toBeGreaterThanOrEqual(previous - 1e-6);
      previous = radius;
    }
  });

  it('swings further round the line the narrower the viewport gets', () => {
    // Foreshortening is what keeps a phone from having to stand thirty
    // metres back. It reads better too: the formation goes into the screen
    // rather than straight across it.
    expect(framingAngle(PORTRAIT_ASPECT)).toBeGreaterThan(framingAngle(LANDSCAPE_ASPECT));
    let previous = -Infinity;
    for (const aspect of [3, 1.78, 1.4, 1, 0.75, 0.46, 0.3]) {
      expect(framingAngle(aspect)).toBeGreaterThanOrEqual(previous);
      previous = framingAngle(aspect);
    }
  });

  it('never swings so far that the cast is seen end-on', () => {
    // Past about sixty degrees the back rank hides behind the front one and
    // the line stops reading as a formation at all.
    for (const aspect of [0.2, 0.3, 0.46, 1, 3, 10]) {
      expect(framingAngle(aspect)).toBeLessThan(Math.PI / 3);
      expect(framingAngle(aspect)).toBeGreaterThan(0);
    }
  });

  it('keeps the landscape angle the shot was originally composed at', () => {
    expect(framingAngle(LANDSCAPE_ASPECT)).toBeCloseTo(0.3, 2);
  });

  it('gives a usable answer for a viewport of no size', () => {
    // A canvas that has not been laid out reports 0×0, and a camera at NaN
    // metres renders nothing at all, permanently.
    for (const aspect of [0, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const radius = framingRadius({ target: TARGET, beta: BETA, fov: FOV, aspect });
      expect(Number.isFinite(radius), `aspect ${aspect}`).toBe(true);
      expect(radius).toBeGreaterThan(0);
      expect(Number.isFinite(framingAngle(aspect))).toBe(true);
    }
  });

  it('covers every actor and every bar, and no more', () => {
    // A bar is billboarded, so it presents its full width to the camera
    // whatever angle the shot is at — which is how the enemy's ran off the
    // edge while the enemy itself was comfortably inside the frame.
    expect(FIGHT_BOUNDS.maxX).toBeGreaterThanOrEqual(ENEMY_POSITION.x + ENEMY_BAR.width / 2);
    expect(FIGHT_BOUNDS.minX).toBeLessThanOrEqual(TEAM_BAR_X - TEAM_BAR.width / 2);
    expect(FIGHT_BOUNDS.minX).toBeLessThanOrEqual(RANK_X.back);
    expect(FIGHT_BOUNDS.maxY).toBeGreaterThan(TEAM_BAR.above);
    expect(boundsCorners(FIGHT_BOUNDS)).toHaveLength(8);
    // And not padded past what is in it: a metre of empty world on either
    // side is a metre the camera stands back for, on every screen.
    expect(FIGHT_BOUNDS.minX).toBeGreaterThan(RANK_X.back - 2);
    expect(FIGHT_BOUNDS.maxX).toBeLessThan(ENEMY_POSITION.x + 2);
  });

  it('puts a point at the target in the middle of the screen', () => {
    // The sanity check for the projection itself: without it, every other
    // assertion here could be agreeing with the same arithmetic error.
    const at = screenPositionOf(TARGET, {
      target: TARGET,
      alpha: -Math.PI / 2 + 0.3,
      beta: BETA,
      radius: 10,
      fov: FOV,
      aspect: 1.78,
    });
    expect(at.x).toBeCloseTo(0, 6);
    expect(at.y).toBeCloseTo(0, 6);
  });

  it('puts a point above the target above the middle, and one to its right, right', () => {
    const view = {
      target: TARGET,
      // Square on, so world +x is screen right with no swing to reason about.
      alpha: -Math.PI / 2,
      beta: Math.PI / 2,
      radius: 10,
      fov: FOV,
      aspect: 1.78,
    };
    expect(screenPositionOf({ ...TARGET, y: TARGET.y + 1 }, view).y).toBeGreaterThan(0);
    expect(screenPositionOf({ ...TARGET, x: TARGET.x + 1 }, view).x).toBeGreaterThan(0);
  });
});
