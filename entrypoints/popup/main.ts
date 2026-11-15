import { browser } from 'wxt/browser';
import { requiredElement } from '@/utils/dom';
import { localize } from '@/utils/i18n-template';

localize();

const openOptionsButton = requiredElement<HTMLButtonElement>(
  document,
  '#open-options',
);

openOptionsButton.addEventListener('click', async () => {
  await browser.runtime.openOptionsPage();
  window.close();
});
