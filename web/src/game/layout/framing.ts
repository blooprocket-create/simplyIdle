import { ENEMY_BAR, ENEMY_POSITION, RANK_SPACING, RANK_X, TEAM_BAR, TEAM_BAR_X } from './battleLine';

/**
 * Where to put the camera so the whole fight is on screen.
 *
 * Two things make this harder than picking a distance. Babylon holds the
 * *vertical* field of view fixed, so narrowing the viewport narrows what can
 * be seen across — a shot composed on a desktop showed a portrait phone less
 * than half the battle line. And the shot is not symmetric about what it
 * points at: the camera is swung off the line's axis, so the near end
 * subtends a much wider angle than the far one, and an estimate that treats
 * the two halves alike puts the near end off the edge.
 *
 * So rather than approximate, this projects the corners of the box the fight
 * occupies and finds the closest distance that still contains all of them.
 * It is arithmetic, and arithmetic belongs somewhere it can be asserted
 * without a GL context.
 */

/** Roughly 16:9, the shape the shot was originally composed for. */
export const LANDSCAPE_ASPECT = 1.78;

/** Roughly a phone held upright, the shape it has to survive. */
export const PORTRAIT_ASPECT = 0.46;

/** Off the line's axis at the narrowest viewport, and at the widest. */
const NARROW_ANGLE = 0.95;
const WIDE_ANGLE = 0.3;

/**
 * How far an actor's own geometry reaches either side of where it stands.
 * A boss is scaled up, so this is generous rather than measured.
 */
const ACTOR_REACH = 0.9;

/** Room above the tallest thing a boss can scale to, bar and numbers included. */
const HEADROOM = 3.4;

export interface Bounds {
  minX: number;
  maxX: number;
  maxY: number;
  halfDepth: number;
}

/**
 * Everything that has to be on screen, in world units.
 *
 * Derived from where things actually are rather than from a margin, because
 * a margin is a guess that gets it wrong in both directions at once: the
 * first version of this was 1.7m too wide on the left, where the team's bar
 * happens to end exactly at the back rank, and not wide enough on the right,
 * where the enemy's bar overhangs the enemy by a metre.
 */
export const FIGHT_BOUNDS: Bounds = {
  minX: Math.min(RANK_X.back - ACTOR_REACH, TEAM_BAR_X - TEAM_BAR.width / 2),
  maxX: Math.max(ENEMY_POSITION.x + ACTOR_REACH, ENEMY_POSITION.x + ENEMY_BAR.width / 2),
  maxY: HEADROOM,
  // Two heroes share a rank, one either side of the line.
  halfDepth: RANK_SPACING,
};

export interface Point {
  x: number;
  y: number;
  z: number;
}

export interface View {
  target: Point;
  /** Azimuth, as Babylon's `ArcRotateCamera.alpha`. */
  alpha: number;
  /** Polar angle from +Y, as Babylon's `beta`. */
  beta: number;
  radius: number;
  /** Vertical field of view, in radians. */
  fov: number;
  aspect: number;
}

/** The eight corners of the box, which is where a box is at its widest. */
export function boundsCorners(bounds: Bounds): Point[] {
  const corners: Point[] = [];
  for (const x of [bounds.minX, bounds.maxX]) {
    for (const y of [0, bounds.maxY]) {
      for (const z of [-bounds.halfDepth, bounds.halfDepth]) corners.push({ x, y, z });
    }
  }
  return corners;
}

/**
 * Where a world point lands, as a fraction of the half-frame.
 *
 * ±1 is the edge of the screen on each axis, so "is it visible" is
 * `|x| <= 1 && |y| <= 1` and nothing has to know about pixels. A point
 * behind the camera comes back past the edge rather than wrapping round to
 * the middle, which is what a raw divide by a negative depth would do.
 */
export function screenPositionOf(point: Point, view: View): { x: number; y: number } {
  const eye = eyePosition(view);
  const forward = normalise(subtract(view.target, eye));
  const right = normalise(cross(WORLD_UP, forward));
  const up = cross(forward, right);

  const offset = subtract(point, eye);
  const depth = dot(offset, forward);
  if (depth <= 1e-6) return { x: Infinity, y: Infinity };

  const halfHeight = Math.tan(Math.max(view.fov, 1e-3) / 2);
  const halfWidth = halfHeight * usableAspect(view.aspect);
  return {
    x: dot(offset, right) / depth / halfWidth,
    y: dot(offset, up) / depth / halfHeight,
  };
}

/**
 * How far round the line to swing, given the shape of the viewport.
 *
 * Square-on, the line needs its full width on screen. Swung round, it is
 * foreshortened and needs less — which is what stops a phone held upright
 * having to stand thirty metres back to fit everyone in. Capped short of the
 * point where the back rank hides behind the front one.
 */
export function framingAngle(aspect: number): number {
  const safeAspect = usableAspect(aspect);
  const t = Math.min(1, Math.max(0, (safeAspect - PORTRAIT_ASPECT) / (LANDSCAPE_ASPECT - PORTRAIT_ASPECT)));
  return NARROW_ANGLE + (WIDE_ANGLE - NARROW_ANGLE) * t;
}

export interface FramingRequest {
  target: Point;
  beta: number;
  fov: number;
  aspect: number;
  bounds?: Bounds;
}

/**
 * The closest distance at which the whole fight is still in frame.
 *
 * Found by bisection rather than solved, because "contains every corner" is
 * a handful of dot products and a closed form for it would be a page of
 * trigonometry nobody could check. Containment is monotonic in the radius —
 * pulling back never hides something that was visible — which is exactly the
 * property bisection needs.
 */
export function framingRadius(request: FramingRequest): number {
  const aspect = usableAspect(request.aspect);
  const corners = boundsCorners(request.bounds ?? FIGHT_BOUNDS);
  const alpha = -Math.PI / 2 + framingAngle(aspect);
  const at = (radius: number): View => ({ ...request, aspect, alpha, radius });

  const contains = (radius: number): boolean =>
    corners.every(corner => {
      const position = screenPositionOf(corner, at(radius));
      return Math.abs(position.x) <= 1 && Math.abs(position.y) <= 1;
    });

  // Double until something works, so the search never assumes a ceiling.
  let high = MIN_RADIUS;
  while (!contains(high) && high < MAX_RADIUS) high *= 2;
  if (!contains(high)) return MAX_RADIUS;

  let low = MIN_RADIUS;
  for (let step = 0; step < BISECTION_STEPS; step += 1) {
    const middle = (low + high) / 2;
    if (contains(middle)) high = middle;
    else low = middle;
  }
  return high;
}

const MIN_RADIUS = 0.5;
const MAX_RADIUS = 4096;
/** Enough to land within a millimetre of the closest distance that fits. */
const BISECTION_STEPS = 48;

const WORLD_UP: Point = { x: 0, y: 1, z: 0 };

/** Babylon's own arrangement, so the two agree about where the camera is. */
function eyePosition(view: View): Point {
  const sinBeta = Math.sin(view.beta);
  return {
    x: view.target.x + view.radius * Math.cos(view.alpha) * sinBeta,
    y: view.target.y + view.radius * Math.cos(view.beta),
    z: view.target.z + view.radius * Math.sin(view.alpha) * sinBeta,
  };
}

const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y + a.z * b.z;

const cross = (a: Point, b: Point): Point => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

function normalise(vector: Point): Point {
  const length = Math.sqrt(dot(vector, vector)) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

/**
 * A canvas that has not been laid out yet reports 0×0, and a camera placed at
 * NaN metres renders nothing at all, permanently. Anything unusable is
 * treated as the shape the game was composed for.
 */
function usableAspect(aspect: number): number {
  return Number.isFinite(aspect) && aspect > 0 ? aspect : LANDSCAPE_ASPECT;
}
