import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUTOMATIONS } from '../content/automation';
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

  it('leaves paint order to the DOM, which is what the rule below relies on', () => {
    /*
     * Not a style preference. The shell has no stacking contexts at all, so
     * "renders later" and "paints on top" are the same statement — and the
     * next rule reasons purely about source order. One `z-index` anywhere
     * would make that reasoning silently wrong rather than loudly wrong.
     */
    const sheets = [...FILES, ...collect(join(process.cwd(), 'src', 'app'))].filter(file => file.path.endsWith('.css'));
    expect(sheets.length).toBeGreaterThan(0);
    expect(offences(sheets, /z-index/)).toEqual([]);
  });

  it('keeps the wipe offer reachable while a surface or the rail is open', () => {
    /*
     * A wipe offer stands for eight seconds and then lapses in silence. The
     * shell rendered it before `SurfaceHost` and before `Rail` and gated it
     * on nothing being open, so an offer raised while the player was reading
     * Heroes expired unseen and the retreat stood unanswered — which is most
     * of what Phase 4 replaced when it stopped wipes being a silent teleport.
     *
     * BURST is deliberately not held to this: a lapsed window keeps its
     * charge and re-arms, so reading costs the peak and nothing more.
     */
    const shell = readFileSync(join(process.cwd(), 'src', 'app', 'App.tsx'), 'utf8');
    const lines = codeOnly(shell).split('\n');
    const at = (needle: string) => lines.findIndex(line => line.includes(needle));

    const offer = at('<WipeOffer');
    expect(offer, 'App.tsx no longer renders <WipeOffer').toBeGreaterThan(-1);
    expect(at('<SurfaceHost'), 'the offer must paint over an open surface').toBeLessThan(offer);
    expect(at('<Rail'), 'the offer must paint over an open rail').toBeLessThan(offer);

    // Nothing may gate it on the fight being the only thing on screen.
    const gatesAbove = lines.slice(0, offer).filter(line => line.includes('open === null'));
    expect(gatesAbove).toEqual([]);
  });

  it('lets no automation reach the simulation except through the gate that earns it', () => {
    /*
     * Phase 4's thesis, made structural rather than merely true today.
     *
     * The shipped game's nine `auto*` flags were plain settings toggles with
     * no gate on any of them, and the fault was the *absent* gate rather than
     * the default any of them shipped with. An absence that is only an
     * absence comes back the first time someone wires the next automation
     * straight from a switch, and the policy this phase built would still be
     * sitting there, correct and bypassed.
     *
     * `loopRef` is declared and used only in `App.tsx` — nothing else in the
     * tree holds the loop — so reading that one file covers every path by
     * which anything at all reaches the running simulation.
     */
    const shell = codeOnly(readFileSync(join(process.cwd(), 'src', 'app', 'App.tsx'), 'utf8'));
    const lower = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

    const wired = [...shell.matchAll(/\.setAuto([A-Z]\w*)\(/g)].map(match => lower(match[1])).sort();
    const gated = [...shell.matchAll(/automation\.active\.has\('([^']+)'\)/g)].map(match => match[1]).sort();
    const available = AUTOMATIONS.filter(entry => entry.available)
      .map(entry => entry.id)
      .sort();

    expect(wired.length, 'the shell wires no automation at all').toBeGreaterThan(0);
    // Wired but ungated is the shipped fault coming back. Gated but unwired
    // is a switch that promises something nothing delivers.
    expect(wired, 'every automation the shell wires must read from `active`').toEqual(gated);
    // And the catalogue cannot claim an automation this build does not
    // honour, nor honour one it does not admit to having.
    expect(wired, 'what is marked available must be exactly what is wired').toEqual(available);
  });

  it('hands the loop every roster field the simulation can take', () => {
    /*
     * The failure this project keeps finding, made structural.
     *
     * Five systems in a row were ported, tested, and then never called: the
     * clock existed, the reader read it, and the fight ran without it. Hero
     * abilities were the fifth, and they were found by accident — a mitigation
     * fixture came out 0.8 off on every scenario with a warrior in it.
     *
     * A field can only reach the fight one way: `rosterFromSave` puts it on
     * `LoadedRoster`, `SimulationOptions` names it, and `App.tsx` passes it to
     * the loop. The first two are typed and the third is not — an omitted
     * optional is not a type error — so that third step is the one that can
     * silently not happen, and this is the test for it.
     *
     * Derived from the two interfaces rather than listed, so the next field
     * anyone adds to both is covered on the day it is added rather than on the
     * day someone remembers to extend a list here.
     */
    const read = (...parts: string[]) => readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');
    const fieldsOf = (source: string, name: string) => {
      const body = new RegExp(`export interface ${name} \\{(.*?)\\n\\}`, 's').exec(codeOnly(source));
      expect(body, `${name} is no longer an interface this test can read`).not.toBeNull();
      return [...body![1].matchAll(/^ {2}(\w+)\??:/gm)].map(match => match[1]);
    };

    const provided = fieldsOf(read('app', 'roster.ts'), 'LoadedRoster');
    const accepted = fieldsOf(read('engine', 'Simulation.ts'), 'SimulationOptions');
    const shared = provided.filter(field => accepted.includes(field)).sort();

    // If this ever empties out, the test has stopped meaning anything rather
    // than started passing.
    expect(shared.length, 'the roster and the simulation share no field at all').toBeGreaterThan(2);

    const shell = codeOnly(read('app', 'App.tsx'));
    for (const field of shared) {
      expect(shell, `App.tsx builds roster.${field} and never hands it to the loop`).toContain(`roster.${field}`);
    }
  });

  it('lets the player read an act mechanic outside the fight that uses it', () => {
    /*
     * The gap this closes. For a while nothing but the fight itself imported
     * the mechanics, so the only way to learn what an act's boss does was to
     * meet it mid-fight inside a window under a second and a half — and a
     * thing you can only discover while it is happening is not something you
     * can be good at, which is the whole of "hand-played".
     *
     * Campaign names it, because that is the screen a player opens to decide
     * whether to push on. The Codex carries all six with what each one asks,
     * because it is a ledger and can hold a list.
     */
    const surfaces = FILES.filter(file => within(file, 'surfaces'));
    const readers = surfaces.filter(file => /bossMechanics/.test(codeOnly(file.text))).map(f => f.relativePath);
    expect(readers.sort()).toEqual(['surfaces/CampaignSurface.tsx', 'surfaces/CodexSurface.tsx']);
  });

  it('never reaches into the renderer', () => {
    // React owns the HUD and the surfaces; Babylon owns the diorama. A
    // component importing the renderer directly is how the two stop being
    // separable.
    expect(offences(FILES, /@babylonjs/)).toEqual([]);
  });
});
