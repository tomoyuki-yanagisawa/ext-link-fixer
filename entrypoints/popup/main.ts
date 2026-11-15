import { browser } from 'wxt/browser';
import { requiredElement, setText } from '@/utils/dom';

const openOptionsButton = requiredElement<HTMLButtonElement>(document, '#open-options');

document.documentElement.lang = browser.i18n.getUILanguage();
document.title = browser.i18n.getMessage('extensionName');
setText('#heading', browser.i18n.getMessage('extensionName'));
setText('#description', browser.i18n.getMessage('popup_description'));
setText('#open-options', browser.i18n.getMessage('popup_openOptions'));

openOptionsButton.addEventListener('click', async () => {
  await browser.runtime.openOptionsPage();
  window.close();
});
