import { describe, expect, it } from 'vitest';
import fixture from '../../content/__fixtures__/mail.json';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { readSave } from '../save/v3';
import { migrateSave } from '../save/migrate';
import { toLegacyPayload } from '../save/legacyPayload';
import type { SaveV3 } from '../save/schema';
import {
  ATTACHMENT_KEYS,
  claimEverything,
  claimFrom,
  noAttachments,
  outstanding,
  readMailbox,
  unreadCount,
  type AttachmentKey,
} from './mailbox';

/**
 * The mailbox, against the shipped claim rules — and the welcome gift, which
 * is measured and deliberately not minted.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const OPTIONS = { nowMs: NOW, content: CONTENT };

/** The measured welcome gift, as a message a migrated account would carry. */
const GIFT = {
  id: 'mail_welcome_gift_v1',
  subject: 'Welcome to SimplyIdle',
  from: 'SimplyIdle Team',
  sentAt: NOW,
  message: 'Thank you for joining.',
  attachments: fixture.onCreation.welcomeGift,
  claimedAttachments: { gold: 0, shards: 0, diamonds: 0, essence: 0, tears: 0 },
};

function save(messages: unknown[] = []): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 20 },
      wallet: { gold: 0, totalGold: 0, heroShards: 0, diamonds: 0, essence: 0, bossTears: 0 },
      mail: { messages },
    },
    OPTIONS,
  );
}

const withGift = () => save([{ ...GIFT, sentAtMs: NOW, claimed: GIFT.claimedAttachments }]);

const purse = (state: SaveV3): Record<AttachmentKey, number> => ({
  gold: state.wallet.gold,
  shards: state.wallet.heroShards,
  diamonds: state.wallet.diamonds,
  essence: state.wallet.essence,
  tears: state.wallet.bossTears,
});

const moved = (before: SaveV3, after: SaveV3) =>
  Object.fromEntries(ATTACHMENT_KEYS.map(key => [key, purse(after)[key] - purse(before)[key]])) as Record<
    AttachmentKey,
    number
  >;

describe('a new account', () => {
  it('starts with an empty mailbox, and the shipped one does not', () => {
    /*
     * **The decision.** The shipped `CREATE_CHARACTER` sets `gold: 100` and in
     * the same object puts a mail in the box worth 10,000,000 gold, 50,000
     * shards, 500 diamonds, 500 essence and 20 tears — measured, and a hundred
     * thousand times the starting purse.
     *
     * That is a launch-day grant rather than a game rule, and what a new
     * player should start with is the question Phase 8 deferred and Phase 10
     * deferred again. An empty box leaves it answerable; inheriting the gift
     * answers it at five orders of magnitude by accident.
     */
    expect(fixture.onCreation.welcomeGift.gold / fixture.onCreation.startingGold).toBe(100_000);
    expect(save().mail.messages).toEqual([]);
    expect(unreadCount(save().mail)).toBe(0);
  });

  it('keeps a gift an existing account already holds', () => {
    // It was promised to them. A migration that dropped it would be taking
    // something back, which is a different thing from not granting it.
    const migrated = migrateSave({ saveVersion: 2, mailbox: [GIFT] }, OPTIONS);
    expect(migrated.mail.messages).toHaveLength(1);
    expect(migrated.mail.messages[0].attachments).toEqual(fixture.onCreation.welcomeGift);
  });
});

describe('claiming from one message', () => {
  it('pays the currencies asked for and no others', () => {
    for (const row of fixture.partialClaims) {
      const before = withGift();
      const claim = claimFrom(before, GIFT.id, [row.key as AttachmentKey])!;
      expect({ key: row.key, paid: moved(before, claim.save) }).toEqual({ key: row.key, paid: row.paid });
    }
  });

  it('empties what it took off the message and leaves the rest', () => {
    const claim = claimFrom(withGift(), GIFT.id, ['gold'])!;
    const message = claim.save.mail.messages[0];
    expect(message.attachments.gold).toBe(0);
    expect(message.attachments.shards).toBe(fixture.onCreation.welcomeGift.shards);
    // And records what it paid, so a part-claimed mail can still say what it
    // was worth.
    expect(message.claimed.gold).toBe(fixture.onCreation.welcomeGift.gold);
  });

  it('refuses a message nobody has, and one already emptied of what was asked', () => {
    expect(claimFrom(withGift(), 'nothing_at_all', ATTACHMENT_KEYS)).toBeNull();
    const once = claimFrom(withGift(), GIFT.id, ['gold'])!.save;
    expect(claimFrom(once, GIFT.id, ['gold'])).toBeNull();
    // But the rest of the message is still there.
    expect(claimFrom(once, GIFT.id, ['shards'])).not.toBeNull();
  });
});

describe('claiming everything', () => {
  it('hands over the whole box in one press', () => {
    const before = withGift();
    const claim = claimEverything(before)!;
    expect(moved(before, claim.save)).toEqual(fixture.claimAll);
    expect(unreadCount(claim.save.mail)).toBe(0);
    // Lifetime gold climbs with the purse, as every other grant in the game
    // does — one that did not would make every `totalGold` achievement
    // quietly cheaper, and ten million is not a quiet amount.
    expect(claim.save.wallet.totalGold - before.wallet.totalGold).toBe(fixture.claimAll.gold);
  });

  it('answers null for a box with nothing left on it', () => {
    expect(claimEverything(save())).toBeNull();
    const emptied = claimEverything(withGift())!.save;
    expect(claimEverything(emptied)).toBeNull();
  });

  it('adds up what is still waiting across every message', () => {
    const two = save([
      { ...GIFT, id: 'a', sentAtMs: NOW, claimed: noAttachments() },
      { ...GIFT, id: 'b', sentAtMs: NOW, claimed: noAttachments() },
    ]);
    expect(outstanding(two.mail).gold).toBe(fixture.onCreation.welcomeGift.gold * 2);
    expect(unreadCount(two.mail)).toBe(2);
  });
});

describe('the stored box', () => {
  it('reads the shipped shape and our own', () => {
    const fromV2 = readMailbox({ mailbox: [GIFT] }, true);
    expect(fromV2.messages[0]).toMatchObject({
      id: GIFT.id,
      subject: GIFT.subject,
      body: GIFT.message,
      attachments: fixture.onCreation.welcomeGift,
    });
    expect(readMailbox({ messages: [{ ...GIFT, sentAtMs: 1, claimed: noAttachments() }] }).messages).toHaveLength(1);
    expect(readMailbox(null).messages).toEqual([]);
  });

  it('drops a message with no id, and floors a negative attachment', () => {
    expect(readMailbox({ mailbox: [{ subject: 'nameless' }] }, true).messages).toEqual([]);
    const negative = readMailbox({ mailbox: [{ ...GIFT, attachments: { gold: -5 } }] }, true);
    expect(negative.messages[0].attachments).toEqual(noAttachments());
  });

  it('round-trips through a migration and back out', () => {
    const migrated = migrateSave({ saveVersion: 2, mailbox: [GIFT] }, OPTIONS);
    expect(migrated.legacy.mailbox).toBeUndefined();
    const payload = toLegacyPayload(migrated) as { mailbox: { id: string; attachments: unknown }[] };
    expect(payload.mailbox[0]).toMatchObject({ id: GIFT.id, attachments: fixture.onCreation.welcomeGift });
  });
});
