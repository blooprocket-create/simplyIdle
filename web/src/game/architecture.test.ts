import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The renderer boundary, enforced the same way the engine and UI boundaries
 * are: regexes over source text, written before the code they constrain.
 *
 * `game` sits between the engine and the shell. It reads snapshots and draws
 * them, and Babylon lives here and nowhere else — the UI rules already forbid
 * a component importing the renderer, and these are the other half of that
 * seam.
 */

const GAME_ROOT = join(process.cwd(), 'src', 'game');

interface SourceFile {
  relativePath: string;
  text: string;
}

function collect(directory: string): SourceFile[] {
  const files: SourceFile[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collect(path));
      continue;
    }
    if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    files.push({ relativePath: relative(GAME_ROOT, path).split(sep).join('/'), text: readFileSync(path, 'utf8') });
  }
  return files;
}

/**
 * Rules match code, not prose. A comment explaining why the renderer may not
 * import React has to be allowed to say "React", or the rule pushes its own
 * explanation out of the file to stay green.
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

const FILES = collect(GAME_ROOT);

/** Cap on the diorama coordinator, matching the engine's. */
const DIORAMA_MAX_LINES = 300;

/**
 * Subsystems that must stay runnable in a bare Node test. Frame pacing and
 * device tiers are decisions, not drawing, and a decision that can only be
 * exercised inside a GL context is a decision nobody tests.
 */
const HEADLESS_DIRECTORIES = ['device/', 'layout/', 'models/'];

describe('game architecture', () => {
  it('has files to check', () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it('strips prose without stripping code', () => {
    // Without this the helper could quietly start returning nothing and every
    // rule below would pass for the wrong reason.
    const stripped = codeOnly(
      [
        '/** Explaining why this may not import react or reach into ../ui/thing. */',
        '// A line comment naming @babylonjs/core.',
        ' * A JSDoc continuation naming ../app/GameLoop.',
        "import { Scene } from '@babylonjs/core/scene';",
      ].join('\n'),
    );
    expect(stripped).toContain("import { Scene } from '@babylonjs/core/scene';");
    expect(stripped).not.toContain('../ui/thing');
    expect(stripped).not.toContain('../app/GameLoop');
  });

  it('never imports from a layer above it', () => {
    // The shell owns the clock and the HUD and reads from here. An import the
    // other way makes the renderer unconstructable without React mounted.
    for (const file of FILES) {
      const source = codeOnly(file.text);
      expect(source, file.relativePath).not.toMatch(/from ['"][./]*\.\.\/(ui|app)\//);
      expect(source, file.relativePath).not.toMatch(/from ['"]react/);
    }
  });

  it('keeps decisions testable without a GL context', () => {
    for (const file of FILES) {
      if (!HEADLESS_DIRECTORIES.some(directory => file.relativePath.startsWith(directory))) continue;
      expect(codeOnly(file.text), file.relativePath).not.toMatch(/@babylonjs/);
    }
  });

  it('covers every headless directory it claims to', () => {
    // A rule that matches no files passes for free. This is the guard that
    // notices when a directory is renamed and takes its constraint with it.
    for (const directory of HEADLESS_DIRECTORIES) {
      expect(
        FILES.some(file => file.relativePath.startsWith(directory)),
        `no files under ${directory}`,
      ).toBe(true);
    }
  });

  it('keeps the diorama a coordinator instead of a god file', () => {
    const source = readFileSync(join(GAME_ROOT, 'Diorama.ts'), 'utf8');
    expect(source.split('\n').length).toBeLessThan(DIORAMA_MAX_LINES);
  });
});
