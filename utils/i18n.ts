import { browser } from 'wxt/browser';

type MessageKey = Exclude<
  Parameters<typeof browser.i18n.getMessage>[0],
  `@@${string}`
>;

function translate(key: string): string {
  return browser.i18n.getMessage(key as MessageKey);
}

/**
 * `data-i18n` のテキストと、`data-i18n-aria-label` の属性を
 * 現在のロケールの文言に置き換える。キーが無ければ既定の文言を残す。
 */
export function localize(root: ParentNode = document): void {
  document.documentElement.lang = browser.i18n.getUILanguage();

  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n;
    const message = key ? translate(key) : '';

    if (message) {
      element.textContent = message;
    }
  }

  for (const element of root.querySelectorAll<HTMLElement>(
    '[data-i18n-aria-label]',
  )) {
    const key = element.dataset.i18nAriaLabel;
    const message = key ? translate(key) : '';

    if (message) {
      element.setAttribute('aria-label', message);
    }
  }
}
