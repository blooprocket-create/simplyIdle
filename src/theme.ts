/**
 * Enhanced Dark Theme for Mobile-First UI
 * Focused on clarity, contrast, and mobile usability
 */

export const THEME = {
  // Primary backgrounds - deeper, cleaner
  bg: {
    primary: '#050810',      // Darkest - main screen
    secondary: '#0A0E1A',    // Cards, content areas
    tertiary: '#0F1420',     // Alt cards, subtle diff
    elevated: '#131B2A',     // Modals, panels
    overlay: 'rgba(0,0,0,0.7)', // Modal overlays
  },

  // Surfaces and borders
  surface: {
    border: '#1E2D3E',       // Card borders (visible)
    divider: '#16232F',      // Section dividers
    hover: '#141D2B',        // Interactive hover state
  },

  // Text hierarchy
  text: {
    primary: '#F5F7FA',      // Main text - bright white
    secondary: '#B8C5D6',    // Secondary info
    tertiary: '#9AAABE',     // Hints, subtle text (WCAG AA 4.5:1)
    muted: '#8A9AAE',        // Very muted (WCAG AA 4.5:1)
  },

  // Status colors (rarity, importance)
  status: {
    success: '#6DDB7B',      // Green - positive
    warning: '#FFB347',      // Orange - warning
    error: '#FF5B8A',        // Red - negative
    info: '#5DA8FF',         // Blue - neutral info
    rare: '#8FD2FF',         // Light blue - rare
    epic: '#C77DFF',         // Purple - epic
    legendary: '#FFD700',    // Gold - legendary
    godly: '#FF8866',        // Coral - godly
  },

  // Tabs & Navigation
  nav: {
    inactive: {
      text: '#8A96A8',
      bg: '#0A0E1A',
      border: '#1A2435',
    },
    active: {
      text: '#F5F7FA',
      bg: '#141D2B',
      border: '#6DDB7B',
    },
  },

  // Header specific
  header: {
    bg: '#070A12',
    border: '#1A2435',
    actionBtn: '#0F1828',
    actionBtnBorder: '#2A3F54',
  },

  // Resource indicators
  resource: {
    gold: '#FFD700',
    diamonds: '#FF8FD8',
    tears: '#5FC3FF',
    shards: '#FF9FD8',
    essence: '#9FD8FF',
  },

  // Combat metrics
  combat: {
    dps: '#8FD2FF',
    power: '#FFD700',
    hp: '#6DDB7B',
    defense: '#FFB347',
    damage: '#FF5B8A',
  },

  // Component specific
  card: {
    default: '#0A0F1B',
    highlight: '#0F1828',
    success: '#0D2B20',
    warning: '#2B2010',
    error: '#2B0D15',
  },

  // Bottom sheet styling
  sheet: {
    bg: '#0A0E1A',
    border: '#1E2D3E',
    handle: '#3A4A5E',
  },

  // Reduced info style - for decluttered UI
  reduced: {
    chip: {
      bg: '#0F1420',
      text: '#8A96A8',
      border: '#1A2435',
    },
  },
} as const;

// Typography definitions
export const TYPOGRAPHY = {
  header1: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  header2: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  section: { fontSize: 14, fontWeight: '700' },
  body: { fontSize: 13, fontWeight: '500' },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  caption: { fontSize: 10, fontWeight: '500' },
  tiny: { fontSize: 9, fontWeight: '600' },
} as const;

// Spacing system
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

// Border radius
export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  full: 999,
} as const;

// Z-index layers
export const Z_INDEX = {
  base: 0,
  content: 1,
  header: 10,
  modal: 100,
  overlay: 200,
  toast: 300,
} as const;

// Shadow styles
export const SHADOWS = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2, elevation: 1 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 5 },
} as const;
