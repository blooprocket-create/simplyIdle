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

/**
 * These rules match source text, so they have to read code and not prose.
 * Several of the comments in this tree quote the very thing the rules ban —
 * explaining that the shipped away clock calls `Date.now()` is the point of
 * the comment — and a rule that could not tell the difference would push that
 * explanation out of the codebase to keep itself green.
 *
 * Block comments and whole-line comments come out; a trailing comment after
 * code stays, so prose worth protecting belongs above the line it describes.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');
}

/** Cap on the coordinator. Rules belong in subsystems, not here. */
const COORDINATOR_MAX_LINES = 300;

describe('engine dependency boundary', () => {
  it('has files to check', () => {
    expect(ENGINE_FILES.length).toBeGreaterThan(0);
  });

  it('strips prose without stripping code', () => {
    // Without this, `codeOnly` could quietly start returning nothing and every
    // rule below would pass for the wrong reason. The two halves of this
    // fixture are the exact confusion the helper exists to resolve.
    const stripped = codeOnly(
      [
        '/** Explaining that the shipped clock calls Date.now() inline. */',
        '// A line comment mentioning window.location and localStorage.',
        ' * A JSDoc continuation naming document.body.',
        'const real = Date.now();',
        "import x from '../ui/thing';",
      ].join('\n'),
    );

    expect(stripped).toContain('const real = Date.now();');
    expect(stripped).toContain("import x from '../ui/thing';");
    expect(stripped).not.toContain('window.location');
    expect(stripped).not.toContain('document.body');
    expect(stripped).not.toContain('shipped clock');
  });

  it('never imports presentation or browser runtime dependencies', () => {
    for (const file of ENGINE_FILES) {
      const source = codeOnly(readFileSync(file, 'utf8'));
      expect(source, file).not.toMatch(/from ['"]react/);
      expect(source, file).not.toMatch(/@babylonjs/);
      expect(source, file).not.toMatch(/\bdocument\./);
      expect(source, file).not.toMatch(/\bwindow\./);
      expect(source, file).not.toMatch(/\blocalStorage\b/);
    }
  });

  it('never reads the clock for itself', () => {
    // Time is an argument, not an ambient fact. The save reader and the away
    // clock both depend on "now", and the shipped versions of both call
    // `Date.now()` inline — which is why `sanitizeSaveData` cannot be tested
    // without stubbing a global, and why the offline window can be moved by
    // the device clock with nothing able to observe it.
    for (const file of ENGINE_FILES) {
      const source = codeOnly(readFileSync(file, 'utf8'));
      expect(source, file).not.toMatch(/\bDate\.now\(/);
      expect(source, file).not.toMatch(/\bperformance\.now\(/);
    }
  });

  it('never imports from a layer above it', () => {
    // The engine is the bottom of the stack. `ui`, `game` and `app` all read
    // from it; a single import the other way makes the simulation unrunnable
    // in a bare Node test, which is what the parity suite depends on.
    for (const file of ENGINE_FILES) {
      const source = codeOnly(readFileSync(file, 'utf8'));
      expect(source, file).not.toMatch(/from ['"][./]*\.\.\/(ui|game|app|ports)\//);
    }
  });

  it('keeps authored content out of engine modules', () => {
    // Heroes, gear and acts are data in `src/content`. An engine that also
    // owns the catalog is how gameConfig.ts and useGameState.ts grew into each
    // other in the first place.
    const combined = ENGINE_FILES.map(file => codeOnly(readFileSync(file, 'utf8'))).join('\n');
    expect(combined).not.toMatch(/export const HERO_POOL\s*=/);
    expect(combined).not.toMatch(/export const EQUIPMENT_CATALOG\s*=/);
    expect(combined).not.toMatch(/export const ACHIEVEMENTS\s*=/);
  });

  it('keeps the simulation a coordinator instead of a god file', () => {
    const source = readFileSync(join(ENGINE_ROOT, 'Simulation.ts'), 'utf8');
    expect(source.split('\n').length).toBeLessThan(COORDINATOR_MAX_LINES);
  });
});
