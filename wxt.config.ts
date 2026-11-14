import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Link Fixer',
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
