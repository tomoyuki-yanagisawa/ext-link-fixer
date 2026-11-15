import '@wxt-dev/auto-icons';
import { defineConfig } from 'wxt';
import { generateThemeIcons } from './scripts/theme-icons.mjs';

export default defineConfig({
  modules: ['@wxt-dev/auto-icons'],
  hooks: {
    async 'build:publicAssets'(wxt, files) {
      if (wxt.config.browser !== 'firefox') return;
      const dir = `${wxt.config.wxtDir}/theme-icons`;
      await generateThemeIcons(dir);
      for (const size of [16, 32, 48, 128]) {
        for (const theme of ['light', 'dark']) {
          const name = `icon-on-${theme}-${size}.png`;
          const relativeDest = `theme-icons/${name}`;
          const existing = files.findIndex((file) => file.relativeDest === relativeDest);
          if (existing !== -1) files.splice(existing, 1);
          files.push({ absoluteSrc: `${dir}/${name}`, relativeDest });
        }
      }
    },
  },
  autoIcons: {
    baseIconPath: 'assets/icon.svg',
  },

  manifest: ({ browser }) => ({
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    action: {
      default_title: '__MSG_extensionName__',
      default_icon: {
        16: 'icons/16.png',
        32: 'icons/32.png',
        48: 'icons/48.png',
        128: 'icons/128.png',
      },
      ...(browser === 'firefox'
        ? {
            // Firefox の theme_icons は、dark が「濃い文字のテーマ（ライト）」、
            // light が「明るい文字のテーマ（ダーク）」用。
            theme_icons: [16, 32, 48, 128].map((size) => ({
              dark: `theme-icons/icon-on-light-${size}.png`,
              light: `theme-icons/icon-on-dark-${size}.png`,
              size,
            })),
          }
        : {}),
    },
    permissions: ['declarativeNetRequest'],
    host_permissions: ['http://*/*', 'https://*/*'],
    browser_specific_settings: {
      gecko: {
        id: '@link-fixer.tomoyuki-yanagisawa',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  }),
});
