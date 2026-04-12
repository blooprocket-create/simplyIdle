/**
 * English string catalog — the source-of-truth locale.
 * Keys are dot-path namespaced (e.g. "header.combatStats").
 * Interpolation uses {{variable}} syntax.
 */
const en = {
  // ── Game Header ──────────────────────────────────────────
  header: {
    combatStats: 'Combat Stats',
    dps: 'DPS',
    dpsLabel: 'DPS:',
    power: 'Power',
    powerLabel: 'Power:',
    goldA11y: 'Gold: {{amount}}',
    cloudSyncedNow: 'Cloud Synced just now',
    cloudSyncedAgo: 'Cloud Synced {{seconds}}s ago',
    cloudSyncing: 'Cloud Syncing...',
    cloudConflict: 'Cloud Conflict Resolved',
    cloudSyncError: 'Cloud Sync Error',
    localSaveOnly: 'Local Save Only',
    expProgress: 'EXP {{current}}/{{required}}',
    offlineBanner: 'Offline — progress saved locally',
    syncErrorBanner: 'Cloud sync error — playing offline',
  },

  // ── Tap / Attack ─────────────────────────────────────────
  tap: {
    attack: 'ATTACK',
    damage: '-{{amount}} dmg',
  },

  // ── Prestige / Rebirth ───────────────────────────────────
  prestige: {
    title: 'REBIRTH',
    subtitle: 'Reset your journey for an eternal power bonus.',
    currentWave: 'Current Wave',
    highestWave: 'Highest Wave',
    required: 'Required',
    rebirthCount: 'Rebirth Count',
    currentBonus: 'Current Bonus',
    newBonus: 'New Power Bonus',
    bonusExplain:
      'Bonus = {{multiplier}}× per rebirth, compounding. Applies to all DPS.',
    notReady:
      'Reach peak wave {{wave}} first! ({{remaining}} to go)',
    cancelButton: 'Not Yet',
    confirmButton: 'Ascend',
  },

  // ── Buildings ────────────────────────────────────────────
  building: {
    dpsEach: '{{dps}} DPS each',
  },

  // ── Progress Tab ─────────────────────────────────────────
  progress: {
    title: 'Progress',
    achievementCount: '{{count}}/{{total}} achievements',
    accountStats: 'Account Stats',
    dailyStreak: 'Daily Streak',
    peakWave: 'Peak Wave',
    totalKills: 'Total Kills',
    totalGoldEarned: 'Total Gold Earned',
    weeklyMilestones: 'Weekly Milestones',
    weeklyKills: 'Weekly Kills',
    claimed: 'Claimed',
  },

  // ── Engine Tab ───────────────────────────────────────────
  engine: {
    title: 'Growth Engine',
    subtitle: 'Stats, gear, and infrastructure',
    allocateStats: 'Allocate Stats',
    allocateAll: 'Allocate All ({{unspent}})',
    gold: 'Gold',
    essence: 'Essence',
    armory: 'Armory',
    manageEquipment: 'Manage Equipment',
    expeditions: 'Expeditions',
    noExpeditions: 'No expeditions active',
    manageExpeditions: 'Manage Expeditions',
    facilities: 'Facilities',
    facilitiesSubtitle: 'Upgrade infrastructure for bonuses',
    manageFacilities: 'Manage Facilities',
  },

  // ── Stat Names ───────────────────────────────────────────
  stats: {
    str: 'STR',
    vit: 'VIT',
    agi: 'AGI',
    int: 'INT',
    spr: 'SPR',
  },

  // ── Common / Shared ──────────────────────────────────────
  common: {
    level: 'Level',
    wave: 'Wave',
    close: 'Close',
    confirm: 'Confirm',
    cancel: 'Cancel',
    loading: 'Loading...',
    retry: 'Retry',
    error: 'Error',
    save: 'Save',
    ok: 'OK',
    yes: 'Yes',
    no: 'No',
  },
} as const;

export type StringCatalog = typeof en;
export default en;
