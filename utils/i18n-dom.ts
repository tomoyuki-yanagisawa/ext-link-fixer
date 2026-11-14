import { i18n, type GeneratedI18nStructure } from '#i18n';
import { browser } from 'wxt/browser';

/**
 * 置換を必要としない文言のキー。
 * 置換を含む文言は、型の合う `i18n.t()` を直接呼ぶ。
 */
export type MessageKey = {
  [K in keyof GeneratedI18nStructure]: GeneratedI18nStructure[K] extends {
    plural: false;
    substitutions: 0;
    namedSubstitutions: readonly string[];
  }
    ? never
    : K;
}[keyof GeneratedI18nStructure];

/** `data-i18n-*` 属性で指定できる、テキストを差し替える属性。 */
const LOCALIZED_ATTRIBUTES = ['aria-label', 'placeholder', 'title'] as const;

function translate(key: string): string {
  return i18n.t(key as MessageKey);
}

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
      element.textContent = translate(key);
    }
  }

  for (const attribute of LOCALIZED_ATTRIBUTES) {
    const dataAttribute = `data-i18n-${attribute}`;

    for (const element of root.querySelectorAll<HTMLElement>(`[${dataAttribute}]`)) {
      const key = element.getAttribute(dataAttribute);
      if (key) {
        element.setAttribute(attribute, translate(key));
      }
    }
  }
}
