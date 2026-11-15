// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMessage, getUILanguage } = vi.hoisted(() => ({
  getMessage: vi.fn((key: string) => {
    const messages: Record<string, string> = {
      hello: 'こんにちは',
      label: 'ラベル',
    };
    return messages[key] ?? '';
  }),
  getUILanguage: vi.fn(() => 'ja'),
}));

vi.mock('wxt/browser', () => ({
  browser: { i18n: { getMessage, getUILanguage } },
}));

function resetDocument() {
  document.documentElement.lang = '';
  document.documentElement.innerHTML = `
    <body>
      <p id="text" data-i18n="hello">fallback</p>
      <input id="label" data-i18n-aria-label="label" aria-label="fallback" />
      <template id="template">
        <span data-i18n="hello">fallback</span>
      </template>
    </body>
  `;
}

describe('localize', () => {
  beforeEach(() => {
    vi.resetModules();
    resetDocument();
  });

  it('sets the document language and replaces text and attributes', async () => {
    const { localize } = await import('../../utils/i18n');

    localize();

    expect(document.documentElement.lang).toBe('ja');
    expect(document.querySelector('#text')?.textContent).toBe('こんにちは');
    expect(document.querySelector('#label')?.getAttribute('aria-label')).toBe(
      'ラベル',
    );
  });

  it('does not change the document language for a fragment', async () => {
    const { localize } = await import('../../utils/i18n');
    document.documentElement.lang = 'en';
    const template = document.querySelector<HTMLTemplateElement>('#template')!;

    localize(template.content);

    expect(document.documentElement.lang).toBe('en');
    expect(template.content.querySelector('span')?.textContent).toBe(
      'こんにちは',
    );
  });
});
