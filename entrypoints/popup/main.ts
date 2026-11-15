import { browser } from 'wxt/browser';
import { localize } from '@/utils/i18n';

localize();

const openOptionsButton = document.querySelector<HTMLButtonElement>('#open-options');

if (!openOptionsButton) {
  throw new Error('Element not found: #open-options');
}

openOptionsButton.addEventListener('click', async () => {
  await browser.runtime.openOptionsPage();
  window.close();
});
