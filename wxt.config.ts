import '@wxt-dev/auto-icons';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/auto-icons'],
  autoIcons: {
    baseIconPath: 'assets/icon.svg',
  },

  manifest: {
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
  },
});
