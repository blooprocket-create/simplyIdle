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
    cloudSyncedNow: 'Cloud Synced just now',
    cloudSyncedAgo: 'Cloud Synced {{seconds}}s ago',
    cloudSyncing: 'Cloud Syncing...',
    cloudConflict: 'Cloud Conflict Resolved',
    cloudSyncError: 'Cloud Sync Error',
    localSaveOnly: 'Local Save Only',
    expProgress: 'EXP {{current}}/{{required}}',
    offlineBanner: 'Offline — progress saved locally',
    syncErrorBanner: 'Cloud sync error — playing offline',
    goldA11y: 'Gold: {{amount}}',
    diamondsA11y: 'Diamonds: {{amount}}',
    bossTearsA11y: 'Boss Tears: {{amount}}',
    heroShardsA11y: 'Hero Shards: {{amount}}',
    essenceA11y: 'Essence: {{amount}}',
    settingsA11y: 'Settings',
    mailA11y: 'Mail{{unreadSuffix}}',
    dpsA11y: 'DPS: {{amount}}. Tap for combat stats',
  },

  // ── Title Screen ────────────────────────────────────────
  title: {
    line1: 'The frontier beacons relight after years of silence.',
    line2: 'Your command seal activates.',
    line3: 'Old war machines answer your name.',
    subtitle: 'Command. Conquer. Ascend.',
    beginCampaign: 'BEGIN CAMPAIGN',
    beginCampaignA11y: 'Begin campaign',
    version: 'v{{version}}',
  },

  // ── Auth Screen ─────────────────────────────────────────
  auth: {
    onlineCommandAccess: 'Online Command Access',
    appName: 'SimplyIdle',
    heroSubtitle:
      'Use real Firebase auth, keep progress tied to your account, and let players enter with Google or email instead of the old local-only form.',
    returnToCommand: 'Return to Command',
    openNewLedger: 'Open a New Ledger',
    statusFirebase: 'Firebase',
    modeLogin: 'Log In',
    modeCreate: 'Create',
    continueWithGoogle: 'Continue with Google',
    choosePublicUsername: 'Choose Public Username',
    finishGoogleSignup: 'Finish Google Signup',
    orUseEmail: 'or use email',
    identityLabel: 'Email',
    identityPlaceholder: 'commander@domain.com',
    identityHelper: 'Use the same email whenever you log in or sign up.',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter password',
    passwordHelper: 'Password: minimum {{min}} characters.',
    confirmPasswordLabel: 'Confirm Password',
    confirmPasswordPlaceholder: 'Repeat password',
    confirmPasswordHelperOk: 'Confirmation must match exactly.',
    confirmPasswordHelperMismatch: 'Passwords do not match.',
    publicUsernameLabel: 'Public Username',
    publicUsernamePlaceholder: 'your_username',
    publicUsernameRange:
      '{{min}}-{{max}} characters, letters/numbers/underscores. This name is shown publicly on the leaderboard.',
    publicUsernameGoogleRange:
      '{{min}}-{{max}} characters. This name is your public identity online.',
    submitPleaseWait: 'Please wait...',
    submitCreateAccount: 'Create Account',
    supportingOnline:
      'Sign in with your account to sync progress across devices.',
    supportingOffline:
      'Authentication not available. Please check your Firebase configuration.',
    googleNoteWeb:
      'Google sign-in uses the Firebase web popup flow configured in Firebase.',
    googleNoteNativeReady: 'Google sign-in is ready for this build.',
    googleNoteNativeMissing:
      'Google sign-in needs Expo Google client IDs in your public env vars for native builds.',
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
