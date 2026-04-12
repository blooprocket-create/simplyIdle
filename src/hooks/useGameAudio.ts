/**
 * useGameAudio — React hook that wires game events to audio playback.
 *
 * Usage: Call once at the top-level GameScreen / MobileGameScreen.
 * Monitors state changes and fires appropriate sound effects.
 */

import { useEffect, useRef, useCallback } from 'react';
import { playSound, initAudio, toggleMute, isMuted, type SoundId } from '../services/audio';

interface GameAudioState {
  wave: number;
  gold: number;
  diamonds: number;
  heroShards: number;
  prestigeCount: number;
  heroRosterLength: number;
  isBossWave: boolean;
  bossAlive: boolean;
}

/**
 * Initialises the audio system and returns helpers for manual triggers.
 * Automatically plays sounds when tracked state values change.
 */
export function useGameAudio(current: GameAudioState) {
  const prev = useRef<GameAudioState>(current);
  const initialised = useRef(false);

  // Init audio once
  useEffect(() => {
    if (!initialised.current) {
      initialised.current = true;
      initAudio();
    }
  }, []);

  // Detect state changes and fire sounds
  useEffect(() => {
    const p = prev.current;

    // Wave cleared
    if (current.wave > p.wave) {
      playSound('sfx_wave_clear');
    }

    // Boss appeared
    if (current.isBossWave && !p.isBossWave) {
      playSound('sfx_boss_appear');
    }

    // Boss killed
    if (p.bossAlive && !current.bossAlive && p.isBossWave) {
      playSound('sfx_boss_kill');
    }

    // Prestige
    if (current.prestigeCount > p.prestigeCount) {
      playSound('sfx_prestige');
    }

    // Hero summoned
    if (current.heroRosterLength > p.heroRosterLength) {
      playSound('sfx_hero_summon');
    }

    // Diamond gain (skip small ticks to avoid spam)
    if (current.diamonds > p.diamonds && current.diamonds - p.diamonds >= 5) {
      playSound('sfx_diamond_gain');
    }

    prev.current = current;
  }, [current]);

  // Manual triggers for UI events
  const playUI = useCallback((id: SoundId) => {
    playSound(id);
  }, []);

  return { playUI, toggleMute, isMuted };
}
