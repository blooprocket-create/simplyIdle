// ─────────────────────────────────────────────────────────────────────────────
//  MOBILE-OPTIMIZED DARK THEME
// ─────────────────────────────────────────────────────────────────────────────

export const theme = {
  // Core backgrounds (ultra-dark)
  bg: {
    deepestBlack: '#050508', // Pure black overlays, status bar
    darkest: '#0A0A12', // Main background
    dark: '#11111D', // Cards, panels
    darker: '#0D0D14', // Slightly raised panels
    card: '#15151F', // Elevated content
    input: '#1A1A24', // Input fields
  },

  // Text hierarchy
  text: {
    primary: '#FFFFFF', // Main text
    secondary: '#B8B8CC', // Muted text
    tertiary: '#9A9AB0', // Disabled, hints (WCAG AA 4.5:1 on #0A0A12)
    danger: '#FF5B8A',
    success: '#6DDB7B',
    warning: '#FFB347',
    muted: '#8A9AAE', // Subdued text (WCAG AA 4.5:1 on dark bg)
  },

  // Accents
  accent: {
    primary: '#7B68FF', // Main CTA buttons
    secondary: '#FF6B9D', // Secondary CTAs
    gold: '#FFD700',
    purple: '#9D4EDD',
    cyan: '#00D4FF',
  },

  // Status indicators
  status: {
    positive: '#6DDB7B',
    warning: '#FFB347',
    danger: '#FF5B5B',
    critical: '#FF5B8A',
    neutral: '#5A5A6E',
  },

  // Rarity colors (game-specific)
  rarity: {
    common: '#8E8E9B',
    rare: '#4A9EFF',
    epic: '#9D4EDD',
    legendary: '#FFD700',
    mythic: '#FF1493',
    transcendent: '#FF6347',
  },

  // Spacing
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },

  // Borders
  border: {
    subtle: '#1F1F2D',
    light: '#2A2A38',
    medium: '#3A3A4A',
  },

  // Shadows
  shadow: {
    sm: '0 2px 8px rgba(0, 0, 0, 0.6)',
    md: '0 4px 16px rgba(0, 0, 0, 0.8)',
    lg: '0 8px 24px rgba(0, 0, 0, 0.9)',
  },
};

export type Theme = typeof theme;
