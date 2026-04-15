import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () =>
        h(
          'a',
          {
            class: 'back-to-game',
            href: '/',
            title: 'Return to SimplyIdle',
            onClick: (e: MouseEvent) => {
              e.preventDefault();
              window.location.href = '/';
            },
          },
          ['🎮 Back to Game'],
        ),
    });
  },
};
