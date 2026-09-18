/**
 * The story, as nineteen beats.
 *
 * Generated from `__tests__/storyFixture.test.ts`, so the prose is measured
 * off the shipped catalogue rather than retyped.
 *
 * **Sorted by unlock wave, and the shipped array is not.** Its order runs
 * …200, 180, 300, 400, 250, 500, 300, 600, so the finale sits between two
 * chapters that unlock after it and three ascensions hide behind chapters they
 * precede — and `GameScreen` maps it in array order, both to list the story
 * and to decide what to call "next". Measured: over waves 150–179 the game
 * says the next beat is at 200 when one unlocks at 180, and over 200–249 it
 * says 300 when one unlocks at 250.
 *
 * So a player aiming at the next thing to read is told to walk twenty or fifty
 * waves further than they need to. That is a data bug rather than a rule, and
 * sorting is the whole fix — nothing else depends on the order, because the
 * only thing that reads it is the screen that is wrong.
 */

export interface StoryBeat {
  id: string;
  chapter: string;
  title: string;
  body: string;
  unlockWave: number;
  /** Some beats also want a prestige count. Null when the wave is the whole gate. */
  unlockPrestige?: number;
}

/** In the file's order, which is not the order they unlock. */
const AUTHORED: readonly StoryBeat[] = [
  {
    id: 'prologue_ash',
    chapter: 'Prologue',
    title: 'Ashen Signal',
    body: 'The frontier beacons relight after years of silence. Your command seal activates and old war machines answer your name.',
    unlockWave: 1,
  },
  {
    id: 'chapter_1_raiders',
    chapter: 'Chapter I',
    title: 'The Raider Accord',
    body: 'Scattered clans rally under a red standard. Every wave you clear denies their pact another foothold.',
    unlockWave: 10,
  },
  {
    id: 'chapter_2_verdant',
    chapter: 'Chapter II',
    title: 'Roots of the Citadel',
    body: 'Ancient gardens overrun the old roads. Beneath the vines, imperial vault doors begin to open on their own.',
    unlockWave: 20,
  },
  {
    id: 'chapter_3_glass',
    chapter: 'Chapter III',
    title: 'Glass and Oathfire',
    body: 'The crystal city fractures from within. Echoes of the first dynasty demand tribute in blood, gold, and memory.',
    unlockWave: 30,
  },
  {
    id: 'chapter_4_storm',
    chapter: 'Chapter IV',
    title: 'Storm Court',
    body: 'A council of storm captains crowns a false sovereign. Their fleets ride lightning across the abyss horizon.',
    unlockWave: 40,
  },
  {
    id: 'chapter_5_crownfall',
    chapter: 'Chapter V',
    title: 'Crownfall Depths',
    body: 'Sunken throne-ships awaken below black tide. Every captain you defeat restores one lost imperial oath.',
    unlockWave: 50,
  },
  {
    id: 'chapter_6_eclipse',
    chapter: 'Chapter VI',
    title: 'Eternal Eclipse',
    body: 'Daylight dies over the campaign line. Your banner is now one of the final symbols of lawful command.',
    unlockWave: 60,
  },
  {
    id: 'chapter_7_abyss',
    chapter: 'Chapter VII',
    title: 'Abyssal Maw',
    body: 'The monsters no longer retreat. They are converging. Something vast stirs in the deep, drawn by your victories.',
    unlockWave: 80,
  },
  {
    id: 'chapter_8_ascendant',
    chapter: 'Chapter VIII',
    title: 'Ascendant Path',
    body: 'The boundary between mortal and legend begins to dissolve. Your heroes transform. The cost of power becomes visible.',
    unlockWave: 100,
  },
  {
    id: 'ascension_first',
    chapter: 'Ascension I',
    title: 'Rebirth Protocol',
    body: 'Death no longer closes the ledger. You begin rewriting fate through controlled collapse and rebirth cores. Your first cycle completes.',
    unlockWave: 100,
    unlockPrestige: 1,
  },
  {
    id: 'chapter_9_throne',
    chapter: 'Chapter IX',
    title: 'Throne of Kings',
    body: 'Wave 150 marks a reign. Empires rise from your legacies. Ancient records now bear your seal across generations.',
    unlockWave: 150,
  },
  {
    id: 'chapter_10_eternity',
    chapter: 'Chapter X',
    title: 'Eternity Engine',
    body: "Wave 200. Your heroes' names become myth. The cycles accelerate. You are no longer led by time; you lead it.",
    unlockWave: 200,
  },
  {
    id: 'ascension_empire',
    chapter: 'Ascension II',
    title: 'Dynasty Engine',
    body: 'Your cycles form a war-dynasty. Heroes no longer fight for survival alone, but for succession across eras. Legacy multiplies.',
    unlockWave: 180,
    unlockPrestige: 5,
  },
  {
    id: 'chapter_11_void',
    chapter: 'Chapter XI',
    title: 'Void Covenant',
    body: 'Wave 300. The abyss speaks in your voice now. Cults emerge in your wake, seeking the secret of your infinite return.',
    unlockWave: 300,
  },
  {
    id: 'chapter_12_transcendence',
    chapter: 'Chapter XII',
    title: 'Transcendence',
    body: 'Wave 400. You are no longer mortal. Neither are those who follow you. The cosmos itself bends to your campaign.',
    unlockWave: 400,
  },
  {
    id: 'ascension_eternal',
    chapter: 'Ascension III',
    title: 'Eternal Recursion',
    body: 'Prestige 10+. Your rebirths now create branching timelines. Each cycle feeds the next. You are unstoppable.',
    unlockWave: 250,
    unlockPrestige: 10,
  },
  {
    id: 'chapter_13_singularity',
    chapter: 'Chapter XIII',
    title: 'Singularity Breach',
    body: 'Wave 500. Reality fractures under the weight of your victories. The final monsters are echoes of collapsed universes.',
    unlockWave: 500,
  },
  {
    id: 'finale_voidthrone',
    chapter: 'Finale',
    title: 'The Empty Throne',
    body: 'At the edge of all things, one throne remains unclaimed. The cults, captains, and dynasts now turn toward you. The choice is yours alone.',
    unlockWave: 300,
    unlockPrestige: 10,
  },
  {
    id: 'ascension_infinite',
    chapter: 'Apotheosis',
    title: 'Infinite Ascension',
    body: 'Prestige 25+. You have transcended the limitations of your world. Godhood is no longer a destination—it is a waypoint.',
    unlockWave: 600,
    unlockPrestige: 25,
  },
];

/**
 * The beats, in the order a player reaches them.
 *
 * Ties keep their authored order, which is what `sort` being stable buys: the
 * two beats at wave 100 and the two at 300 stay as the writer put them.
 */
export const STORY_BEATS: readonly StoryBeat[] = [...AUTHORED].sort(
  (left, right) => left.unlockWave - right.unlockWave,
);

export const STORY_BEAT_COUNT = STORY_BEATS.length;

export function storyBeatById(id: string): StoryBeat | null {
  return STORY_BEATS.find(beat => beat.id === id) ?? null;
}

export interface StoryProgress {
  /** The deepest wave the account has reached. */
  highestWave: number;
  prestigeCount: number;
}

export function isUnlocked(beat: StoryBeat, progress: StoryProgress): boolean {
  return (
    progress.highestWave >= beat.unlockWave &&
    (beat.unlockPrestige === undefined || progress.prestigeCount >= beat.unlockPrestige)
  );
}

/**
 * The next beat a player will reach, or null once they have them all.
 *
 * `STORY_BEATS` is sorted by unlock wave, so the first locked one *is* the
 * lowest-waved locked one and this is a `find` rather than a scan. That is the
 * whole repair: the shipped screen does exactly this against an **unsorted**
 * array, which is why it names a beat at 300 when one unlocks at 250.
 *
 * It is the lowest-waved rather than the soonest, and those differ: a beat
 * gated on a prestige can sit at wave 100 and stay locked at wave 200. So the
 * answer is "the earliest one you have not read", and `missingGate` says what
 * is actually holding it — a screen quoting a wave the player passed long ago
 * would be the ordering bug again in a different costume.
 */
export function nextBeat(progress: StoryProgress): StoryBeat | null {
  return STORY_BEATS.find(beat => !isUnlocked(beat, progress)) ?? null;
}

/** What is still owed on a locked beat: a wave, a prestige, or both. */
export function missingGate(beat: StoryBeat, progress: StoryProgress): { wave: boolean; prestige: boolean } {
  return {
    wave: progress.highestWave < beat.unlockWave,
    prestige: beat.unlockPrestige !== undefined && progress.prestigeCount < beat.unlockPrestige,
  };
}
