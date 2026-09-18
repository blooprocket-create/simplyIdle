import { ATTACHMENT_KEYS, hasAnything, outstanding, unreadCount, type MailMessage } from '../../engine/mail/mailbox';
import type { SaveV3 } from '../../engine/save/schema';
import { formatDamage } from '../../format/bigNumber';
import type { SurfaceProps } from './SurfaceProps';
import { Row, Rows, Section } from './parts/parts';

/**
 * The mailbox.
 *
 * A `ledger` — a list to spend down, and in this build a short one: the
 * sender is the social layer in Phase 12, so the only messages here are the
 * ones a migrated account arrived with. A new account's box is empty, and
 * the row below says so rather than leaving a blank panel.
 */

const LABEL: Record<(typeof ATTACHMENT_KEYS)[number], string> = {
  gold: 'gold',
  shards: 'shards',
  diamonds: '💎',
  essence: 'essence',
  tears: 'tears',
};

/** What a message says under its subject: what is still on it, or that it is empty. */
export function attachmentLine(message: MailMessage): string {
  const parts = ATTACHMENT_KEYS.filter(key => message.attachments[key] > 0).map(
    key => `${formatDamage(message.attachments[key])} ${LABEL[key]}`,
  );
  if (parts.length > 0) return parts.join(' · ');
  return hasAnything(message.claimed) ? 'Collected' : 'Nothing attached';
}

export function mailView(save: SaveV3) {
  return {
    messages: save.mail.messages,
    waiting: unreadCount(save.mail),
    total: outstanding(save.mail),
  };
}

export function MailSurface({ save, actions }: SurfaceProps) {
  const view = mailView(save);

  return (
    <>
      <Section title="Mail">
        <Rows>
          <Row
            label="Collect everything attached"
            hint={
              view.messages.length === 0
                ? 'Nothing has been sent yet'
                : `${view.waiting} of ${view.messages.length} still have something on them`
            }
          >
            <button type="button" disabled={view.waiting === 0} onClick={() => actions.claimAllMail()}>
              {view.waiting === 0 ? 'Nothing waiting' : `Collect ${view.waiting}`}
            </button>
          </Row>
        </Rows>
      </Section>

      {view.messages.length > 0 && (
        <Section title="Messages">
          <Rows>
            {view.messages.map(message => (
              <Row key={message.id} label={message.subject || '(no subject)'} hint={attachmentLine(message)}>
                <button
                  type="button"
                  disabled={!hasAnything(message.attachments)}
                  onClick={() => actions.claimMail(message.id)}
                >
                  {hasAnything(message.attachments) ? 'Collect' : 'Collected'}
                </button>
              </Row>
            ))}
          </Rows>
        </Section>
      )}
    </>
  );
}
