import { scoreCapabilities } from '../../game/device/DeviceProfile';
import { REGISTRY } from '../nav/registry';
import { shelfLayout } from '../nav/destinations';
import type { SurfaceProps } from './SurfaceProps';
import { Empty, Row, Rows, Section, Tag } from './parts/parts';

/**
 * What the game worked out about this device, and what it did about it.
 *
 * Deliberately not a control panel. There is nothing here to change yet and
 * pretending otherwise would be the lie: quality is chosen from the device
 * and then adapted per-frame by the governor, motion follows the operating
 * system's own setting, and the shelf is pinned from the rail where the
 * destinations are. A screen of switches that did nothing would be worse than
 * a screen that explains itself.
 *
 * What it is instead is the answer to "why does it look like this on my
 * phone" — which, for a renderer that silently drops a tier when frames get
 * long, is a question with no other answer.
 */
export function SettingsSurface({ device, snapshot, profile, pinnedIds }: SurfaceProps) {
  const { profile: quality, capabilities } = device;
  // The player's own pins, not the registry's defaults. Passing an empty
  // preference here made this section report what a new player would see
  // rather than what is on the shelf behind it.
  const pinned = shelfLayout(REGISTRY, snapshot, pinnedIds).pinned;

  return (
    <>
      <Section title="Quality">
        <Rows>
          <Row label="Tier" hint={`Scored ${scoreCapabilities(capabilities)} — 3 or more is high, 1 or more is medium`}>
            <Tag tone={quality.tier === 'high' ? 'good' : quality.tier === 'medium' ? 'gold' : 'warn'}>
              {quality.tier}
            </Tag>
          </Row>
          <Row label="Render scale" hint="Backbuffer against CSS pixels">
            {quality.renderScale}×
          </Row>
          <Row label="Target" hint="What the frame governor holds for">
            {quality.targetFps} fps
          </Row>
          <Row label="Shadows">{quality.shadows ? 'On' : 'Off'}</Row>
          <Row label="Damage numbers" hint="Alive at once before the oldest is recycled">
            {quality.maxDamageNumbers}
          </Row>
          <Row label="Actors" hint="Drawn at once">
            {quality.maxActors}
          </Row>
        </Rows>
        <Empty>
          The tier is a starting point. If frames run long the governor drops one, and restores it only after a much
          longer stretch of headroom — so what is drawn can be below what is listed here.
        </Empty>
      </Section>

      <Section title="This device">
        <Rows>
          <Row label="Memory" hint="Safari and Firefox do not report this">
            {capabilities.memoryGb === undefined ? 'Not reported' : `${capabilities.memoryGb} GB`}
          </Row>
          <Row label="Cores" hint="Absent on older Safari">
            {capabilities.cores === undefined ? 'Not reported' : capabilities.cores}
          </Row>
          <Row label="Pixel ratio">{capabilities.pixelRatio}</Row>
          <Row label="Longest edge">{capabilities.longestEdgePx} px</Row>
          <Row label="Pointer">{capabilities.touch ? 'Touch' : 'Mouse'}</Row>
        </Rows>
        <Empty>
          No single one of these decides the tier. They are scored together, because a browser that reports neither
          memory nor cores would otherwise be graded on nothing.
        </Empty>
      </Section>

      <Section title="Motion">
        <Rows>
          <Row label="Reduced motion" hint="Follows your system setting">
            {quality.reducedMotion ? 'On' : 'Off'}
          </Row>
        </Rows>
        <Empty>
          {quality.reducedMotion
            ? 'Recoil and rising damage numbers are off. The boss telegraph holds a steady tint instead of pulsing, so a boss still reads as one.'
            : 'Turn on reduced motion in your system settings and the recoil, the rising numbers and the boss pulse all stop.'}
        </Empty>
      </Section>

      <Section title="Shelf">
        <Rows>
          {pinned.map(destination => (
            <Row key={destination.id} label={destination.label} hint={destination.group}>
              Pinned
            </Row>
          ))}
        </Rows>
        <Empty>Pinning is done from More, next to the destination being pinned. The shelf holds three, forever.</Empty>
      </Section>

      <Section title="Player">
        <Rows>
          <Row label="Name">{profile.name || 'Unnamed'}</Row>
          <Row label="Save" hint="The shipped save lives behind sign-in; this build does not read it yet">
            Demo roster
          </Row>
        </Rows>
      </Section>
    </>
  );
}
