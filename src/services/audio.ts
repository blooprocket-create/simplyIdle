/**
 * Audio service scaffold for SimplyIdle.
 *
 * Provides a lightweight, cross-platform sound manager with:
 * - Named sound registry (SFX + ambient tracks)
 * - Volume control per category (sfx / music / ui)
 * - Mute toggle with persistence
 * - Graceful no-op when audio unavailable (e.g. SSR, test env)
 *
 * Dependency: `expo-av` — install via `npx expo install expo-av`
 * Until expo-av is installed, all calls are safe no-ops.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Sound Catalogue ──────────────────────────────────────────
export type SoundCategory = 'sfx' | 'music' | 'ui';

export type SoundId =
  // UI interactions
  | 'ui_tap'
  | 'ui_tab_switch'
  | 'ui_modal_open'
  | 'ui_modal_close'
  // Combat
  | 'sfx_hit'
  | 'sfx_crit'
  | 'sfx_boss_appear'
  | 'sfx_boss_kill'
  | 'sfx_wave_clear'
  // Progression
  | 'sfx_level_up'
  | 'sfx_prestige'
  | 'sfx_achievement'
  | 'sfx_hero_summon'
  | 'sfx_hero_summon_epic'
  | 'sfx_hero_summon_legendary'
  // Economy
  | 'sfx_gold_pickup'
  | 'sfx_diamond_gain'
  | 'sfx_shard_gain'
  | 'sfx_equip_forge'
  | 'sfx_equip_dismantle'
  // Minigames
  | 'sfx_dice_roll'
  | 'sfx_lockpick_success'
  | 'sfx_lockpick_fail'
  | 'sfx_rift_enter'
  | 'sfx_rift_clear'
  | 'sfx_treasury_haul'
  // Music
  | 'music_menu'
  | 'music_battle'
  | 'music_boss';

const CATEGORY_MAP: Record<SoundId, SoundCategory> = {
  ui_tap: 'ui',
  ui_tab_switch: 'ui',
  ui_modal_open: 'ui',
  ui_modal_close: 'ui',
  sfx_hit: 'sfx',
  sfx_crit: 'sfx',
  sfx_boss_appear: 'sfx',
  sfx_boss_kill: 'sfx',
  sfx_wave_clear: 'sfx',
  sfx_level_up: 'sfx',
  sfx_prestige: 'sfx',
  sfx_achievement: 'sfx',
  sfx_hero_summon: 'sfx',
  sfx_hero_summon_epic: 'sfx',
  sfx_hero_summon_legendary: 'sfx',
  sfx_gold_pickup: 'sfx',
  sfx_diamond_gain: 'sfx',
  sfx_shard_gain: 'sfx',
  sfx_equip_forge: 'sfx',
  sfx_equip_dismantle: 'sfx',
  sfx_dice_roll: 'sfx',
  sfx_lockpick_success: 'sfx',
  sfx_lockpick_fail: 'sfx',
  sfx_rift_enter: 'sfx',
  sfx_rift_clear: 'sfx',
  sfx_treasury_haul: 'sfx',
  music_menu: 'music',
  music_battle: 'music',
  music_boss: 'music',
};

// ─── Persistence Keys ──────────────────────────────────────────
const STORAGE_KEY_MUTED = '@audio_muted';
const STORAGE_KEY_VOLUMES = '@audio_volumes';

// ─── Audio Engine ──────────────────────────────────────────────

type VolumeMap = Record<SoundCategory, number>;

interface AudioState {
  muted: boolean;
  volumes: VolumeMap;
  ready: boolean;
}

const state: AudioState = {
  muted: false,
  volumes: { sfx: 0.7, music: 0.4, ui: 0.5 },
  ready: false,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Audio: any = null;

async function ensureAudioModule(): Promise<boolean> {
  if (Audio) return true;
  try {
    // Dynamic import — resolves only when expo-av is installed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-av') as { Audio: unknown };
    Audio = mod.Audio;
    return true;
  } catch {
    // expo-av not installed — all calls become no-ops
    return false;
  }
}

export async function initAudio(): Promise<void> {
  if (state.ready) return;

  const available = await ensureAudioModule();
  if (!available) {
    state.ready = true; // Mark ready so callers don't wait forever
    return;
  }

  // Restore persisted preferences
  try {
    const [mutedStr, volStr] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_MUTED),
      AsyncStorage.getItem(STORAGE_KEY_VOLUMES),
    ]);
    if (mutedStr !== null) state.muted = mutedStr === 'true';
    if (volStr) {
      const parsed = JSON.parse(volStr) as Partial<VolumeMap>;
      if (typeof parsed.sfx === 'number') state.volumes.sfx = parsed.sfx;
      if (typeof parsed.music === 'number') state.volumes.music = parsed.music;
      if (typeof parsed.ui === 'number') state.volumes.ui = parsed.ui;
    }
  } catch {
    // Preferences lost — use defaults
  }

  // Configure audio session for background / silent mode
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
  } catch {
    // Non-critical — proceed without mode config
  }

  state.ready = true;
}

// ─── Playback ──────────────────────────────────────────────────

/**
 * Play a sound effect by ID. Safe to call before init or when
 * expo-av is unavailable — will silently no-op.
 */
export async function playSound(id: SoundId): Promise<void> {
  if (state.muted || !Audio) return;

  const category = CATEGORY_MAP[id];
  const volume = state.volumes[category];
  if (volume <= 0) return;

  // TODO: Map SoundId → asset require() once sound files are added.
  // Example:
  //   const SOUND_ASSETS: Partial<Record<SoundId, number>> = {
  //     ui_tap: require('../../assets/sounds/ui_tap.mp3'),
  //     sfx_hit: require('../../assets/sounds/sfx_hit.mp3'),
  //   };
  //   const asset = SOUND_ASSETS[id];
  //   if (!asset) return;
  //
  //   const { sound } = await Audio.Sound.createAsync(asset, { volume, shouldPlay: true });
  //   sound.setOnPlaybackStatusUpdate(status => {
  //     if (status.isLoaded && status.didJustFinish) sound.unloadAsync();
  //   });
}

// ─── Volume & Mute Controls ───────────────────────────────────

export function isMuted(): boolean {
  return state.muted;
}

export async function setMuted(muted: boolean): Promise<void> {
  state.muted = muted;
  try {
    await AsyncStorage.setItem(STORAGE_KEY_MUTED, String(muted));
  } catch {
    // Best-effort persistence
  }
}

export async function toggleMute(): Promise<boolean> {
  await setMuted(!state.muted);
  return state.muted;
}

export function getVolume(category: SoundCategory): number {
  return state.volumes[category];
}

export async function setVolume(category: SoundCategory, volume: number): Promise<void> {
  state.volumes[category] = Math.max(0, Math.min(1, volume));
  try {
    await AsyncStorage.setItem(STORAGE_KEY_VOLUMES, JSON.stringify(state.volumes));
  } catch {
    // Best-effort persistence
  }
}

export function getAudioState(): Readonly<AudioState> {
  return state;
}
