import { defineConfig } from 'vitepress';

export default defineConfig({
  base: '/wiki/',
  title: 'SimplyIdle Wiki',
  description: 'Complete player reference for SimplyIdle — mechanics, heroes, gear, social, and strategy.',
  cleanUrls: false,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', href: '/wiki/favicon.ico' }],
  ],
  themeConfig: {
    search: {
      provider: 'local',
    },
    nav: [
      { text: 'Home', link: '/' },
      {
        text: 'Systems',
        items: [
          { text: 'Core Mechanics', link: '/core-mechanics' },
          { text: 'Heroes & Summoning', link: '/heroes' },
          { text: 'Equipment & Gear', link: '/equipment' },
          { text: 'Prestige & Rebirth', link: '/prestige' },
        ],
      },
      {
        text: 'Social',
        items: [
          { text: 'Social Overview', link: '/social' },
          { text: 'Guilds', link: '/guilds' },
          { text: 'Seasons & Leaderboard', link: '/seasons-leaderboard' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Hero Database', link: '/heroes-database' },
          { text: 'Equipment Database', link: '/equipment-database' },
          { text: 'VIP Program', link: '/vip' },
        ],
      },
      { text: 'Strategy', link: '/strategy' },
    ],
    sidebar: [
      {
        text: 'Start Here',
        items: [
          { text: 'Home', link: '/' },
          { text: 'Getting Started', link: '/getting-started' },
        ],
      },
      {
        text: 'Core Systems',
        collapsed: false,
        items: [
          { text: 'Core Mechanics', link: '/core-mechanics' },
          { text: 'Heroes & Summoning', link: '/heroes' },
          { text: 'Equipment & Gear', link: '/equipment' },
          { text: 'Prestige & Rebirth', link: '/prestige' },
          { text: 'VIP Program', link: '/vip' },
        ],
      },
      {
        text: 'Reference Tables',
        collapsed: false,
        items: [
          { text: 'Hero Database', link: '/heroes-database' },
          { text: 'Equipment Database', link: '/equipment-database' },
        ],
      },
      {
        text: 'Social & Multiplayer',
        collapsed: false,
        items: [
          { text: 'Social Overview', link: '/social' },
          { text: 'Guilds', link: '/guilds' },
          { text: 'Seasons & Leaderboard', link: '/seasons-leaderboard' },
        ],
      },
      {
        text: 'Guides & Meta',
        collapsed: true,
        items: [
          { text: 'Strategy Guides', link: '/strategy' },
          { text: 'Known Issues', link: '/known-issues' },
          { text: 'Patch Notes', link: '/patch-notes' },
        ],
      },
      {
        text: 'Wiki Ops',
        collapsed: true,
        items: [
          { text: 'Wiki Standards', link: '/contributing' },
          { text: 'Wiki Ops', link: '/wiki-ops' },
          { text: 'Page Template', link: '/page-template' },
        ],
      },
    ],
    footer: {
      message: 'SimplyIdle Wiki v2 — Values marked Planned are not fully live.',
      copyright: '© SimplyIdle',
    },
    outline: { level: [2, 3] },
  },
});
