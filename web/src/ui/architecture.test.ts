import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARCHETYPES, GROUP_ORDER, SHELF_SLOTS } from './nav/destinations';
import { REGISTRY } from './nav/registry';
import { ARCHETYPE_LAYOUT } from './shell/archetypes';
import { SURFACES } from './surfaces/registry';

/**
 * The presentation rules, as regexes over source text. Ported from evercast,
 * whose comment on them applies here word for word: these are the patterns
 * that stopped the previous UI absorbing new features.
 *
 * The old UI had no such rules, and grew a 5,753-line stylesheet and a
 * 4,190-line screen component. Enforcing them on an empty tree is what keeps
 * "adding a feature is one registry entry" true a year from now.
 */

const UI_ROOT = join(process.cwd(), 'src', 'ui');

interface SourceFile {
  path: string;
  relativePath: string;
  text: string;
}

function collect(directory: string): SourceFile[] {
  const files: SourceFile[] = [];
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return files; // A directory that does not exist yet has nothing to violate.
  }
  for (const entry of entries) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collect(path));
      continue;
    }
    if (!/\.(ts|tsx|css)$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
    files.push({
      path,
      relativePath: relative(UI_ROOT, path).split(sep).join('/'),
      text: readFileSync(path, 'utf8'),
    });
  }
  return files;
}

const FILES = collect(UI_ROOT);
const within = (file: SourceFile, folder: string) => file.relativePath.startsWith(`${folder}/`);

/**
 * Source with its comments blanked out.
 *
 * A rule has to let its own explanation say the forbidden thing, or it pushes
 * that explanation out of the file to stay green — which is how a constraint
 * ends up enforced but unexplained. `src/game/architecture.test.ts` has the
 * same helper for the same reason.
 *
 * It differs from that one in blanking comment lines rather than removing
 * them: this suite reports `file:line`, and dropping lines would make every
 * reported number point somewhere else.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ' '))
    .split('\n')
    .map(line => (line.trim().startsWith('//') ? '' : line))
    .join('\n');
}

/** Reports `file:line` for each match so a failure names the offender. */
function offences(files: SourceFile[], pattern: RegExp): string[] {
  const found: string[] = [];
  for (const file of files) {
    codeOnly(file.text)
      .split('\n')
      .forEach((line, index) => {
        if (pattern.test(line)) found.push(`${file.relativePath}:${index + 1} ${line.trim()}`);
      });
  }
  return found;
}

describe('ui architecture', () => {
  it('has files to check', () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it('strips comments without moving the lines it reports', () => {
    // Without this the helper could quietly start returning nothing, or
    // blank lines it should not, and every rule below would pass for the
    // wrong reason or name the wrong line.
    const stripped = codeOnly(
      [
        '/* A block comment mentioning #ff0000 and repeat(4, 1fr). */',
        '// A line comment mentioning rgba(0,0,0,0.5).',
        '.real { color: #abcdef; }',
        '/* A block',
        '   that spans lines and says overflow: auto; */',
        '.after { top: 4px; }',
      ].join('\n'),
    );
    expect(stripped).toContain('.real { color: #abcdef; }');
    expect(stripped).not.toContain('#ff0000');
    expect(stripped).not.toContain('repeat(4');
    expect(stripped).not.toContain('rgba(');
    expect(stripped).not.toContain('overflow: auto');
    // Six lines in, six lines out, so `file:line` still means something.
    expect(stripped.split('\n')).toHaveLength(6);
    expect(stripped.split('\n')[5]).toContain('.after');
  });

  it('keeps every colour in the token sheet', () => {
    const candidates = FILES.filter(file => file.relativePath !== 'theme/tokens.css');
    // Hex, rgb()/rgba(), hsl()/hsla(). `var(--token)` is the only way to
    // colour anything else. The old styles carried ~400 inline hex literals.
    expect(offences(candidates, /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\s*\(/)).toEqual([]);
  });

  it('never hardcodes a grid track count', () => {
    // `repeat(auto-fill, ...)` and `repeat(var(--n), ...)` are fine; `repeat(4, ...)`
    // is what orphans the fifth card the moment a sixth is added.
    expect(offences(FILES, /repeat\(\s*\d/)).toEqual([]);
  });

  it('never lets a surface own a scroll container', () => {
    // Archetypes and shell chrome own scrolling; a surface describes data and
    // hands it over, which is what keeps two-axis scrolling impossible.
    const candidates = FILES.filter(file => within(file, 'surfaces'));
    expect(offences(candidates, /overflow(-[xy])?\s*:\s*(auto|scroll)/)).toEqual([]);
  });

  it('never positions a surface by hardcoded pixels', () => {
    // Surfaces describe data; archetypes own geometry. Not preceded by a
    // hyphen, so `border-bottom: 1px solid` stays legal.
    const candidates = FILES.filter(file => within(file, 'surfaces'));
    expect(offences(candidates, /(?<![\w-])(top|left|right|bottom)\s*:\s*-?\d+(\.\d+)?px/)).toEqual([]);
  });

  it('keeps the shelf at three slots forever', () => {
    expect(SHELF_SLOTS).toBe(3);
  });

  it('keeps the archetype and group sets closed', () => {
    expect([...ARCHETYPES]).toEqual(['dashboard', 'ledger', 'graph', 'detail', 'moment']);
    expect([...GROUP_ORDER]).toEqual(['power', 'companion', 'world', 'record']);
  });

  it('files a surface that renders a list under an archetype that scrolls', () => {
    /*
     * A `dashboard` and a `graph` are sized to the panel and do not scroll —
     * "a few big numbers and their controls. No list". So a surface that
     * renders a card grid in one has content nobody can reach: it runs off
     * the bottom and the shelf covers it.
     *
     * This is checkable from the source, which is the only reason it is
     * checked here: the Party surface shipped 383px below the fold and only
     * a screenshot found it. A rule that reads the file finds it every time.
     */
    for (const destination of REGISTRY) {
      const component = SURFACES[destination.id];
      if (component === undefined) continue;
      const file = FILES.find(candidate => candidate.relativePath === `surfaces/${component.name}.tsx`);
      expect(file, `${destination.id} -> surfaces/${component.name}.tsx`).toBeDefined();
      if (!file) continue;
      const rendersAList = /<Cards>/.test(codeOnly(file.text));
      if (!rendersAList) continue;
      expect(
        ARCHETYPE_LAYOUT[destination.archetype].scroll,
        `${destination.id} renders a card grid as a ${destination.archetype}`,
      ).toBe('block');
    }
  });

  it('actually finds the surface files it claims to check', () => {
    // The rule above skips anything it cannot resolve, so without this it
    // would pass in full the day the file naming convention changes.
    const resolved = REGISTRY.filter(destination => {
      const component = SURFACES[destination.id];
      return component !== undefined && FILES.some(f => f.relativePath === `surfaces/${component.name}.tsx`);
    });
    expect(resolved.length).toBe(Object.keys(SURFACES).length);
    expect(resolved.length).toBeGreaterThanOrEqual(5);
  });

  it('never fetches a stylesheet asset from anywhere but this origin', () => {
    const sheets = FILES.filter(file => file.relativePath.endsWith('.css'));
    expect(offences(sheets, /url\(\s*['"]?https?:/)).toEqual([]);
  });

  it('never reaches into the renderer', () => {
    // React owns the HUD and the surfaces; Babylon owns the diorama. A
    // component importing the renderer directly is how the two stop being
    // separable.
    expect(offences(FILES, /@babylonjs/)).toEqual([]);
  });
});
