import { boundedInt, boundedString, isRecord, MAX_SAVE_COLLECTION, SAFE_NUMBER_CAP } from '../save/guards';
import type { SaveV3 } from '../save/schema';

/**
 * The mailbox.
 *
 * Five attachment currencies per message, claimable one at a time or all at
 * once. Almost all of it is plumbing for a sender this build does not have:
 * the shipped `APPEND_MAIL_MESSAGES` takes messages from outside, and outside
 * is the social layer in Phase 12. It is ported now anyway, because the one
 * thing that *does* arrive locally is a v2 account's unclaimed mail, and a
 * migration that dropped it would be taking something a player was promised.
 *
 * **The welcome gift is not minted here**, and that is a decision rather than
 * an omission. The shipped `CREATE_CHARACTER` sets `gold: 100` — "starting
 * gold to feel snappy" — and in the same object puts a mail in the box worth
 * 10,000,000 gold, 50,000 shards, 500 diamonds, 500 essence and 20 boss
 * tears. A hundred thousand times the starting purse, in the first thing a
 * new player opens. Measured in `__tests__/mailFixture.test.ts`.
 *
 * That is a launch-day grant, not a game rule, and what a new player should
 * start with is the question Phase 8 deferred and Phase 10 deferred again. A
 * new account here starts with an empty box so the question can be answered
 * deliberately rather than inherited at five orders of magnitude. An account
 * that already holds the gift keeps it: it was promised to them.
 */

export const ATTACHMENT_KEYS = ['gold', 'shards', 'diamonds', 'essence', 'tears'] as const;
export type AttachmentKey = (typeof ATTACHMENT_KEYS)[number];

export type Attachments = Readonly<Record<AttachmentKey, number>>;

export interface MailMessage {
  id: string;
  subject: string;
  from: string;
  sentAtMs: number;
  body: string;
  /** What is still unclaimed. A claim zeroes the key it took. */
  attachments: Attachments;
  /** What has been taken already, so a part-claimed mail can still say so. */
  claimed: Attachments;
}

export interface SavedMailbox {
  messages: MailMessage[];
}

/** The shipped box holds a hundred; ours holds the same. */
export const MAX_MESSAGES = 100;

export function noAttachments(): Attachments {
  return { gold: 0, shards: 0, diamonds: 0, essence: 0, tears: 0 };
}

export function emptyMailbox(): SavedMailbox {
  return { messages: [] };
}

export function hasAnything(attachments: Attachments): boolean {
  return ATTACHMENT_KEYS.some(key => attachments[key] > 0);
}

/** Every unclaimed attachment across the whole box, added up. */
export function outstanding(mailbox: SavedMailbox): Attachments {
  const total = { ...noAttachments() };
  for (const message of mailbox.messages) {
    for (const key of ATTACHMENT_KEYS) total[key] += message.attachments[key];
  }
  return total;
}

export function unreadCount(mailbox: SavedMailbox): number {
  return mailbox.messages.filter(message => hasAnything(message.attachments)).length;
}

function credited(save: SaveV3, taken: Attachments): SaveV3 {
  return {
    ...save,
    wallet: {
      ...save.wallet,
      gold: save.wallet.gold + taken.gold,
      // Lifetime gold climbs with the purse, as every other grant does.
      totalGold: save.wallet.totalGold + taken.gold,
      heroShards: save.wallet.heroShards + taken.shards,
      diamonds: save.wallet.diamonds + taken.diamonds,
      essence: save.wallet.essence + taken.essence,
      bossTears: save.wallet.bossTears + taken.tears,
    },
  };
}

export interface MailClaim {
  save: SaveV3;
  taken: Attachments;
}

/**
 * Take some attachments off one message.
 *
 * Null when the message is gone or the keys asked for are already empty —
 * which is one answer rather than two, because a screen only needs to know
 * whether the button does anything.
 */
export function claimFrom(save: SaveV3, id: string, keys: readonly AttachmentKey[]): MailClaim | null {
  const message = save.mail.messages.find(entry => entry.id === id);
  if (message === undefined) return null;

  const wanted = new Set(keys);
  const taken = { ...noAttachments() };
  for (const key of ATTACHMENT_KEYS) {
    if (wanted.has(key)) taken[key] = Math.max(0, message.attachments[key]);
  }
  if (!hasAnything(taken)) return null;

  const messages = save.mail.messages.map(entry =>
    entry.id !== id
      ? entry
      : {
          ...entry,
          attachments: Object.fromEntries(
            ATTACHMENT_KEYS.map(key => [key, wanted.has(key) ? 0 : entry.attachments[key]]),
          ) as unknown as Attachments,
          claimed: Object.fromEntries(
            ATTACHMENT_KEYS.map(key => [key, entry.claimed[key] + taken[key]]),
          ) as unknown as Attachments,
        },
  );

  return { taken, save: { ...credited(save, taken), mail: { messages } } };
}

/** Take everything in the box, in one press. */
export function claimEverything(save: SaveV3): MailClaim | null {
  let current = save;
  const taken = { ...noAttachments() };
  for (const message of save.mail.messages) {
    const claim = claimFrom(current, message.id, ATTACHMENT_KEYS);
    if (claim === null) continue;
    current = claim.save;
    for (const key of ATTACHMENT_KEYS) taken[key] += claim.taken[key];
  }
  return hasAnything(taken) ? { save: current, taken } : null;
}

function readAttachments(raw: unknown): Attachments {
  const record = isRecord(raw) ? raw : {};
  return Object.fromEntries(
    ATTACHMENT_KEYS.map(key => [key, boundedInt(record[key], 0, SAFE_NUMBER_CAP, 0)]),
  ) as unknown as Attachments;
}

/** From a v2 bag (`mailbox`) or a v3 save (`messages`). */
export function readMailbox(raw: unknown, legacy = false): SavedMailbox {
  const source = legacy ? (isRecord(raw) ? raw.mailbox : null) : isRecord(raw) ? raw.messages : null;
  if (!Array.isArray(source)) return emptyMailbox();

  const messages: MailMessage[] = [];
  for (const entry of source.slice(0, Math.min(MAX_MESSAGES, MAX_SAVE_COLLECTION))) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue;
    messages.push({
      id: entry.id,
      subject: boundedString(entry.subject, '', 200),
      from: boundedString(entry.from, '', 100),
      sentAtMs: boundedInt(entry.sentAtMs ?? entry.sentAt, 0, SAFE_NUMBER_CAP, 0),
      body: boundedString(entry.body ?? entry.message, '', 4_000),
      attachments: readAttachments(entry.attachments),
      claimed: readAttachments(entry.claimed ?? entry.claimedAttachments),
    });
  }
  return { messages };
}

/** Back out to the shape the shipped mailbox holds. */
export function mailboxToLegacy(mailbox: SavedMailbox): Record<string, unknown> {
  return {
    mailbox: mailbox.messages.map(message => ({
      id: message.id,
      subject: message.subject,
      from: message.from,
      sentAt: message.sentAtMs,
      message: message.body,
      attachments: { ...message.attachments },
      claimedAttachments: { ...message.claimed },
    })),
  };
}
