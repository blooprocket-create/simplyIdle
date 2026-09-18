import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { STORY_BEATS, type PlayerClass } from '../src/gameConfig';
import { DEFAULT_STATE, reducer, type GameState } from '../src/useGameState';

/**
 * The story beats, measured.
 *
 * Nineteen entries, each unlocked by a wave and some also by a prestige
 * count. `MARK_STORY_BEAT_SEEN` records that one has been read, and the
 * screen maps the catalogue **in array order** to decide both what to list
 * and what to call "next".
 *
 * Which is where the finding is: the array is not in wave order, so "next"
 * is the first locked entry in the file rather than the nearest one. Found by
 * scanning every wave rather than by reading, because an ordering bug is
 * invisible in a table that looks sorted.
 *
 * Regenerate deliberately:
 *   UPDATE_STORY_FIXTURE=1 npx jest __tests__/storyFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'content', '__fixtures__', 'story.json');

function state(over: Partial<GameState> = {}): GameState {
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    seenStoryBeatIds: [],
    ...over,
  };
}

const markSeen = (from: GameState, storyBeatId: string) =>
  reducer(from, { type: 'MARK_STORY_BEAT_SEEN', storyBeatId } as never);

/** Unlocked exactly as `GameScreen` computes it. */
const unlocked = (beat: (typeof STORY_BEATS)[number], wave: number, prestige: number) =>
  wave >= beat.unlockWave && (beat.unlockPrestige == null || prestige >= beat.unlockPrestige);

interface Fixture {
  note: string;
  generatedFrom: string;
  beats: {
    id: string;
    chapter: string;
    title: string;
    body: string;
    unlockWave: number;
    unlockPrestige: number | null;
  }[];
  /** Whether the catalogue is listed in the order it unlocks. */
  inWaveOrder: boolean;
  /**
   * Waves where "next" — the first locked entry in array order — is not the
   * nearest locked entry. Scanned rather than argued.
   */
  misleadingNextAt: { wave: number; saysNextIs: string; atWave: number; nearestIs: string; atNearestWave: number }[];
  seen: { name: string; recorded: string[] }[];
}

function build(): Fixture {
  // The prose comes across too: the rewrite's catalogue is generated from
  // this, so a beat's text is measured rather than retyped.
  const beats = STORY_BEATS.map(beat => ({
    id: beat.id,
    chapter: beat.chapter,
    title: beat.title,
    body: beat.body,
    unlockWave: beat.unlockWave,
    unlockPrestige: beat.unlockPrestige ?? null,
  }));

  const waves = STORY_BEATS.map(beat => beat.unlockWave);
  const inWaveOrder = waves.every((wave, index) => index === 0 || wave >= waves[index - 1]);

  // Every wave from 1 to past the last unlock, at a prestige high enough that
  // only the wave gates matter — so this measures the ordering and nothing else.
  const misleadingNextAt: Fixture['misleadingNextAt'] = [];
  const PRESTIGE = 99;
  for (let wave = 1; wave <= 620; wave++) {
    const locked = STORY_BEATS.filter(beat => !unlocked(beat, wave, PRESTIGE));
    if (locked.length === 0) continue;
    const saysNext = locked[0];
    const nearest = locked.reduce((best, beat) => (beat.unlockWave < best.unlockWave ? beat : best), locked[0]);
    if (saysNext.id === nearest.id) continue;
    misleadingNextAt.push({
      wave,
      saysNextIs: saysNext.id,
      atWave: saysNext.unlockWave,
      nearestIs: nearest.id,
      atNearestWave: nearest.unlockWave,
    });
  }

  const first = STORY_BEATS[0].id;
  const once = markSeen(state(), first);

  return {
    note: 'The story beats and their unlock order, measured through the shipped reducer.',
    generatedFrom: 'src/gameConfig.ts STORY_BEATS, src/reducers/settingsReducer.ts, src/screens/GameScreen.tsx',
    beats,
    inWaveOrder,
    // Collapsed to the first and last wave of each run, so the fixture records
    // the shape rather than four hundred near-identical rows.
    misleadingNextAt: misleadingNextAt.filter(
      (row, index) =>
        index === 0 ||
        index === misleadingNextAt.length - 1 ||
        misleadingNextAt[index - 1].saysNextIs !== row.saysNextIs ||
        misleadingNextAt[index + 1]?.saysNextIs !== row.saysNextIs,
    ),
    seen: [
      { name: 'marking one', recorded: once.seenStoryBeatIds },
      { name: 'marking the same one twice', recorded: markSeen(once, first).seenStoryBeatIds },
      { name: 'marking one nobody wrote', recorded: markSeen(state(), 'not_a_beat').seenStoryBeatIds },
    ],
  };
}

describe('the catalogue', () => {
  const fixture = build();

  it('has nineteen beats, from wave one to wave six hundred', () => {
    expect(fixture.beats).toHaveLength(19);
    expect(fixture.beats[0].unlockWave).toBe(1);
    expect(Math.max(...fixture.beats.map(beat => beat.unlockWave))).toBe(600);
  });

  it('is not listed in the order it unlocks', () => {
    /*
     * The array runs …200, 180, 300, 400, 250, 500, 300, 600 — so the finale
     * (`finale_voidthrone`, wave 300) sits between two chapters that unlock at
     * 400 and 500, and three ascensions are interleaved behind chapters they
     * precede.
     *
     * The screen maps the catalogue in array order, so this is the order a
     * player reads it in.
     */
    expect(fixture.inWaveOrder).toBe(false);
  });
});

describe('what the game calls the next beat', () => {
  const fixture = build();

  it('is the first locked entry in the file, not the nearest one', () => {
    /*
     * **The finding.** `GameScreen` takes `storyEntries.find(entry =>
     * !entry.unlocked)` — the first locked entry in *array* order — and calls
     * it next. Because the array is not in wave order, that is the wrong beat
     * over a wide stretch of the game.
     *
     * Scanned across every wave from 1 to 620 rather than argued: at wave 210
     * the game says the next beat is at 300 when there is one at 250.
     */
    expect(fixture.misleadingNextAt.length).toBeGreaterThan(0);
    const worst = fixture.misleadingNextAt.reduce((best, row) =>
      row.atWave - row.atNearestWave > best.atWave - best.atNearestWave ? row : best,
    );
    expect(worst.atWave).toBeGreaterThan(worst.atNearestWave);
  });

  it('names the two stretches where it is wrong', () => {
    /*
     * Measured, and the measurement corrected what I had written down: I
     * predicted one stretch starting at 181 with `chapter_11_void`. There are
     * **two**, and the first starts at 150.
     *
     *   - waves 150–179: says the next beat is at 200, when one unlocks at 180.
     *   - waves 200–249: says 300, when one unlocks at 250.
     *
     * Both times it is an *ascension* the array hides behind a later chapter,
     * so a player aiming at the next thing to read is told to walk twenty or
     * fifty waves further than they need to.
     */
    expect(fixture.misleadingNextAt).toEqual([
      { wave: 150, saysNextIs: 'chapter_10_eternity', atWave: 200, nearestIs: 'ascension_empire', atNearestWave: 180 },
      { wave: 179, saysNextIs: 'chapter_10_eternity', atWave: 200, nearestIs: 'ascension_empire', atNearestWave: 180 },
      { wave: 200, saysNextIs: 'chapter_11_void', atWave: 300, nearestIs: 'ascension_eternal', atNearestWave: 250 },
      { wave: 249, saysNextIs: 'chapter_11_void', atWave: 300, nearestIs: 'ascension_eternal', atNearestWave: 250 },
    ]);
  });
});

describe('marking one read', () => {
  const fixture = build();

  it('records it once, and ignores a repeat', () => {
    expect(fixture.seen[0].recorded).toEqual([STORY_BEATS[0].id]);
    expect(fixture.seen[1].recorded).toEqual([STORY_BEATS[0].id]);
  });

  it('records an id nobody wrote, rather than refusing it', () => {
    // No validation at all: the seen list will take any string. Ported as a
    // reader-side rule instead — a stored id with no beat behind it is
    // dropped, which is what every other collection in the rewrite does.
    expect(fixture.seen[2].recorded).toEqual(['not_a_beat']);
  });
});

describe('the committed fixture', () => {
  it('matches what the rewrite is measured against', () => {
    const fixture = build();
    if (process.env.UPDATE_STORY_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
