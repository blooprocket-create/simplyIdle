import { useEffect } from 'react';
import { debugLog, trackGameplayAction } from '../telemetry';

interface UseModalOpenTelemetryArgs {
  activeModal: string | null;
  shopTab: string;
  wave: number;
  seasonPoints: number;
  level: number;
  diamonds: number;
  gold: number;
}

export function useModalOpenTelemetry({
  activeModal,
  shopTab,
  wave,
  seasonPoints,
  level,
  diamonds,
  gold,
}: UseModalOpenTelemetryArgs) {
  useEffect(() => {
    if (activeModal !== 'events') return;

    debugLog('ui', 'Events panel opened', { wave, seasonPoints });
    void trackGameplayAction('ui_events_opened', { wave, seasonPoints }, 1000);
  }, [activeModal, wave, seasonPoints]);

  useEffect(() => {
    if (activeModal !== 'shop') return;

    debugLog('ui', 'Shop opened', { shopTab, diamonds, gold });
    void trackGameplayAction('ui_shop_opened', { shopTab, diamonds, gold }, 1000);
  }, [activeModal, shopTab, diamonds, gold]);

  useEffect(() => {
    if (activeModal !== 'settings') return;

    debugLog('ui', 'Settings opened', { wave, level });
    void trackGameplayAction('ui_settings_opened', { wave, level }, 1000);
  }, [activeModal, wave, level]);
}
