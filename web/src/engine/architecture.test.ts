import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The engine boundary, enforced as regexes over source text rather than as
 * prose in a README. Ported from evercast, whose coordinator is 293 lines
 * against the same guard — while the simulation this rewrite replaces reached
 * 5,901 lines because nothing was checking.
 *
 * These run on an almost-empty tree on purpose. The rules exist before the
 * code does, so no file is ever written under the old assumptions.
 */

const ENGINE_ROOT = join(process.cwd(), 'src', 'engine');

function collectFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(entry => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? collectFiles(path) : [path];
  });
}

const ENGINE_FILES = collectFiles(ENGINE_ROOT).filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'));

/** Cap on the coordinator. Rules belong in subsystems, not here. */
const COORDINATOR_MAX_LINES = 300;

describe('engine dependency boundary', () => {
  it('has files to check', () => {
    expect(ENGINE_FILES.length).toBeGreaterThan(0);
  });

  it('never imports presentation or browser runtime dependencies', () => {
    for (const file of ENGINE_FILES) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/from ['"]react/);
      expect(source, file).not.toMatch(/@babylonjs/);
      expect(source, file).not.toMatch(/\bdocument\./);
      expect(source, file).not.toMatch(/\bwindow\./);
      expect(source, file).not.toMatch(/\blocalStorage\b/);
    }
  });

  it('never imports from a layer above it', () => {
    // The engine is the bottom of the stack. `ui`, `game` and `app` all read
    // from it; a single import the other way makes the simulation unrunnable
    // in a bare Node test, which is what the parity suite depends on.
    for (const file of ENGINE_FILES) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/from ['"][./]*\.\.\/(ui|game|app|ports)\//);
    }
  });

  it('keeps authored content out of engine modules', () => {
    // Heroes, gear and acts are data in `src/content`. An engine that also
    // owns the catalog is how gameConfig.ts and useGameState.ts grew into each
    // other in the first place.
    const combined = ENGINE_FILES.map(file => readFileSync(file, 'utf8')).join('\n');
    expect(combined).not.toMatch(/export const HERO_POOL\s*=/);
    expect(combined).not.toMatch(/export const EQUIPMENT_CATALOG\s*=/);
    expect(combined).not.toMatch(/export const ACHIEVEMENTS\s*=/);
  });

  it('keeps the simulation a coordinator instead of a god file', () => {
    const source = readFileSync(join(ENGINE_ROOT, 'Simulation.ts'), 'utf8');
    expect(source.split('\n').length).toBeLessThan(COORDINATOR_MAX_LINES);
  });
});
