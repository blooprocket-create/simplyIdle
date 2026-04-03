import { defineConfig } from 'vitepress';

export default defineConfig({
  base: '/wiki/',
  title: 'SimplyIdle Wiki',
  description: 'Player reference for systems, progression, and live features.',
  cleanUrls: false,
  lastUpdated: true,
  themeConfig: {
    search: {
      provider: 'local'
    },
    nav: [
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Core', link: '/core-mechanics' },
      { text: 'Heroes', link: '/heroes' },
      { text: 'Hero DB', link: '/heroes-database' },
      { text: 'Equipment', link: '/equipment' },
      { text: 'Gear DB', link: '/equipment-database' },
      { text: 'Social', link: '/social' },
      { text: 'Seasons', link: '/seasons-leaderboard' },
      { text: 'Strategy', link: '/strategy' },
      { text: 'Standards', link: '/contributing' },
      { text: 'Ops', link: '/wiki-ops' }
    ],
    sidebar: [
      {
        text: 'Start Here',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Getting Started', link: '/getting-started' }
        ]
      },
      {
        text: 'Systems',
        items: [
          { text: 'Core Mechanics', link: '/core-mechanics' },
          { text: 'Heroes', link: '/heroes' },
          { text: 'Hero Database', link: '/heroes-database' },
          { text: 'Equipment', link: '/equipment' },
          { text: 'Equipment Database', link: '/equipment-database' },
          { text: 'Social Systems', link: '/social' },
          { text: 'Seasons and Leaderboard', link: '/seasons-leaderboard' }
        ]
      },
      {
        text: 'Guides and Ops',
        items: [
          { text: 'Strategy Guides', link: '/strategy' },
          { text: 'Known Issues', link: '/known-issues' },
          { text: 'Patch Notes', link: '/patch-notes' },
          { text: 'Wiki Standards', link: '/contributing' },
          { text: 'Wiki Ops', link: '/wiki-ops' },
          { text: 'Page Template', link: '/page-template' }
        ]
      }
    ],
    footer: {
      message: 'SimplyIdle Wiki. Values marked Planned are not fully live.',
      copyright: 'SimplyIdle'
    }
  }
});
