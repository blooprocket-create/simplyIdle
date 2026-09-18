import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { PlayerClass } from '../src/gameConfig';
import { DEFAULT_STATE, reducer, type GameState } from '../src/useGameState';

/**
 * The mailbox, measured.
 *
 * Five attachment currencies per message, claimable one at a time or all at
 * once. Almost all of it is plumbing for a sender this build does not have —
 * `APPEND_MAIL_MESSAGES` takes messages from outside, and outside is the
 * social layer in Phase 12 — with exactly one exception, and the exception is
 * the finding: **a new account is created holding a mail worth ten million
 * gold**, beside a starting purse of a hundred.
 *
 * Measured through `CREATE_CHARACTER` rather than read off
 * `WELCOME_GIFT_ATTACHMENTS`, because recording a constant is not measuring a
 * grant — the summon price taught that, and it cost two phases.
 *
 * Regenerate deliberately:
 *   UPDATE_MAIL_FIXTURE=1 npx jest __tests__/mailFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'content', '__fixtures__', 'mail.json');

const KEYS = ['gold', 'shards', 'diamonds', 'essence', 'tears'] as const;
type AttachmentKey = (typeof KEYS)[number];

function fresh(): GameState {
  return reducer({ ...DEFAULT_STATE }, {
    type: 'CREATE_CHARACTER',
    name: 'Ref',
    playerClass: 'warrior' as PlayerClass,
  } as never);
}

/** What the purse holds, in the five currencies a mail can carry. */
function purse(state: GameState) {
  return {
    gold: state.gold,
    shards: state.heroShards,
    diamonds: state.diamonds,
    essence: state.essence,
    tears: state.bossTears,
  };
}

const moved = (before: GameState, after: GameState) => {
  const start = purse(before);
  const end = purse(after);
  return Object.fromEntries(KEYS.map(key => [key, end[key] - start[key]])) as Record<AttachmentKey, number>;
};

interface Fixture {
  note: string;
  generatedFrom: string;
  /** What a brand-new account is holding, and what is sitting in its mail. */
  onCreation: {
    startingGold: number;
    mailCount: number;
    welcomeGift: Record<AttachmentKey, number>;
  };
  /** Claiming one currency at a time. */
  partialClaims: { key: string; paid: Record<AttachmentKey, number>; leftOnMessage: Record<AttachmentKey, number> }[];
  /** Claiming everything, from a fresh account. */
  claimAll: Record<AttachmentKey, number>;
  /** Whether a claim is recorded on the message it came from. */
  recordsWhatItPaid: boolean;
  refusals: { name: string; paid: Record<AttachmentKey, number> }[];
}

function build(): Fixture {
  const created = fresh();
  const gift = created.mailbox[0];

  const claim = (from: GameState, mailId: string, attachment: string) =>
    reducer(from, { type: 'CLAIM_MAIL_ATTACHMENT', mailId, attachment } as never);

  const partial = (key: AttachmentKey) => {
    const after = claim(created, gift.id, key);
    const left = after.mailbox.find(mail => mail.id === gift.id)!.attachments;
    return {
      key,
      paid: moved(created, after),
      leftOnMessage: {
        gold: left.gold,
        shards: left.shards,
        diamonds: left.diamonds,
        essence: left.essence,
        tears: left.tears,
      },
    };
  };

  const all = reducer(created, { type: 'CLAIM_ALL_MAIL_ATTACHMENTS' } as never);
  const afterGold = claim(created, gift.id, 'gold');
  const recorded = afterGold.mailbox.find(mail => mail.id === gift.id)!.claimedAttachments;

  const refusal = (name: string, from: GameState, action: unknown) => ({
    name,
    paid: moved(from, reducer(from, action as never)),
  });

  return {
    note: 'The mailbox and the welcome gift, measured through the shipped reducer.',
    generatedFrom: 'src/useGameState.ts CREATE_CHARACTER, src/reducers/economyReducer.ts',
    onCreation: {
      startingGold: created.gold,
      mailCount: created.mailbox.length,
      welcomeGift: {
        gold: gift.attachments.gold,
        shards: gift.attachments.shards,
        diamonds: gift.attachments.diamonds,
        essence: gift.attachments.essence,
        tears: gift.attachments.tears,
      },
    },
    partialClaims: KEYS.map(partial),
    claimAll: moved(created, all),
    recordsWhatItPaid: (recorded?.gold ?? 0) === gift.attachments.gold,
    refusals: [
      refusal('a mail nobody has', created, { type: 'CLAIM_MAIL_ATTACHMENT', mailId: 'nope', attachment: 'gold' }),
      refusal('an attachment already taken', afterGold, {
        type: 'CLAIM_MAIL_ATTACHMENT',
        mailId: gift.id,
        attachment: 'gold',
      }),
      refusal('claiming all of an empty mailbox', all, { type: 'CLAIM_ALL_MAIL_ATTACHMENTS' }),
    ],
  };
}

describe('what a new account is handed', () => {
  const fixture = build();

  it('starts with a hundred gold, and a mail holding ten million', () => {
    /*
     * **The finding.** `CREATE_CHARACTER` sets `gold: 100` with the comment
     * "starting gold to feel snappy", and in the same object puts a welcome
     * gift in the mailbox worth 10,000,000 gold, 50,000 shards, 500 diamonds,
     * 500 essence and 20 boss tears.
     *
     * So the first thing a new player does is open their mail and end the
     * early game. Measured through the reducer rather than read off the
     * constant, because recording a constant is not measuring a grant.
     */
    expect(fixture.onCreation.startingGold).toBe(100);
    expect(fixture.onCreation.mailCount).toBe(1);
    expect(fixture.onCreation.welcomeGift).toEqual({
      gold: 10_000_000,
      shards: 50_000,
      diamonds: 500,
      essence: 500,
      tears: 20,
    });
  });

  it('puts a hundred thousand times the starting purse in one message', () => {
    // Stated as a ratio because that is the part a reader should not have to
    // work out: the gift is five orders of magnitude past the purse.
    expect(fixture.onCreation.welcomeGift.gold / fixture.onCreation.startingGold).toBe(100_000);
  });
});

describe('claiming one attachment at a time', () => {
  const fixture = build();

  it('pays that currency and no other', () => {
    for (const row of fixture.partialClaims) {
      const paidKeys = Object.entries(row.paid)
        .filter(([, value]) => value !== 0)
        .map(([key]) => key);
      expect(paidKeys).toEqual([row.key]);
    }
  });

  it('empties it off the message and leaves the rest', () => {
    const gold = fixture.partialClaims.find(row => row.key === 'gold')!;
    expect(gold.leftOnMessage.gold).toBe(0);
    expect(gold.leftOnMessage.shards).toBe(fixture.onCreation.welcomeGift.shards);
  });

  it('records what it paid on the message it came from', () => {
    // So a message that has been part-claimed can still say what it was worth.
    expect(fixture.recordsWhatItPaid).toBe(true);
  });
});

describe('claiming everything', () => {
  const fixture = build();

  it('hands over the whole gift in one press', () => {
    expect(fixture.claimAll).toEqual(fixture.onCreation.welcomeGift);
  });
});

describe('what the mailbox refuses', () => {
  const fixture = build();

  it('pays nothing for a mail nobody has, an attachment taken, or an empty box', () => {
    const nothing = { gold: 0, shards: 0, diamonds: 0, essence: 0, tears: 0 };
    expect(fixture.refusals).toEqual([
      { name: 'a mail nobody has', paid: nothing },
      { name: 'an attachment already taken', paid: nothing },
      { name: 'claiming all of an empty mailbox', paid: nothing },
    ]);
  });
});

describe('the committed fixture', () => {
  it('matches what the rewrite is measured against', () => {
    const fixture = build();
    if (process.env.UPDATE_MAIL_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
