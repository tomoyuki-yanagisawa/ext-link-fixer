import { i18n } from '#i18n';
import { browser } from 'wxt/browser';
import { requiredElement, setText } from '@/utils/dom';

const openOptionsButton = requiredElement<HTMLButtonElement>(document, '#open-options');

document.documentElement.lang = browser.i18n.getUILanguage();
document.title = i18n.t('extensionName');
setText('#heading', i18n.t('extensionName'));
setText('#description', i18n.t('popup.description'));
setText('#open-options', i18n.t('popup.openOptions'));

openOptionsButton.addEventListener('click', async () => {
  await browser.runtime.openOptionsPage();
  window.close();
});
