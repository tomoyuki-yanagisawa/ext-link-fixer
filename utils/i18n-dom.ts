import { browser } from 'wxt/browser';

/**
 * `public/_locales/<lang>/messages.json` にあるメッセージ名。
 * WXT が既定ロケールから `browser.i18n.getMessage` の型を生成する。
 */
type MessageKey = Exclude<
  Parameters<typeof browser.i18n.getMessage>[0],
  `@@${string}`
>;

/** メッセージを取得する。置換は `$1`〜`$9` に配列の順で対応する。 */
export function t(key: MessageKey, substitutions: string[] = []): string {
  return browser.i18n.getMessage(key, substitutions);
}

/** `data-i18n-*` 属性で指定できる、テキストを差し替える属性。 */
const LOCALIZED_ATTRIBUTES = ['aria-label', 'placeholder', 'title'] as const;

/**
 * HTML の静的な文言を、現在のロケールに置き換える。
 *
 * - `data-i18n="key"`: 要素のテキスト
 * - `data-i18n-aria-label="key"` など: 対応する属性
 *
 * ブラウザの UI 言語に従うため、言語の切り替え UI は持たない。
 */
export function localize(root: ParentNode = document): void {
  document.documentElement.lang = browser.i18n.getUILanguage();

  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n;
    if (key) {
      element.textContent = t(key as MessageKey);
    }
  }

  for (const attribute of LOCALIZED_ATTRIBUTES) {
    const dataAttribute = `data-i18n-${attribute}`;

    for (const element of root.querySelectorAll<HTMLElement>(`[${dataAttribute}]`)) {
      const key = element.getAttribute(dataAttribute);
      if (key) {
        element.setAttribute(attribute, t(key as MessageKey));
      }
    }
  }
}
