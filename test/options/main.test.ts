// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import html from '../../entrypoints/options/index.html?raw';

const { getDynamicRules, updateDynamicRules } = vi.hoisted(() => ({
  getDynamicRules: vi.fn(),
  updateDynamicRules: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    i18n: {
      getUILanguage: () => 'en',
      getMessage: (key: string, substitutions: string[] = []) =>
        [key, ...substitutions].join(' '),
    },
    declarativeNetRequest: {
      getDynamicRules,
      updateDynamicRules,
      isRegexSupported: vi.fn().mockResolvedValue({ isSupported: true }),
    },
    permissions: { contains: vi.fn().mockResolvedValue(true) },
  },
}));

describe('options page', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    document.documentElement.innerHTML = html.match(
      /<html[^>]*>([\s\S]*)<\/html>/,
    )![1]!;
    getDynamicRules.mockResolvedValue([
      {
        id: 1,
        condition: { regexFilter: 'first' },
        action: { redirect: { regexSubstitution: 'https://a/' } },
      },
      {
        id: 2,
        condition: { regexFilter: 'second' },
        action: { redirect: { regexSubstitution: 'https://b/' } },
      },
    ]);
    updateDynamicRules.mockResolvedValue(undefined);
    await import('../../entrypoints/options/main');
    await vi.waitFor(() =>
      expect(document.querySelectorAll('.rule-row')).toHaveLength(2),
    );
  });

  describe('rule ordering', () => {
    it('moves rows, updates boundary buttons, and saves the new order', async () => {
      const rows = () => [
        ...document.querySelectorAll<HTMLDivElement>('.rule-row'),
      ];
      const first = rows()[0]!;
      const down = first.querySelector<HTMLButtonElement>('.move-down')!;

      expect(first.querySelector<HTMLButtonElement>('.move-up')!.disabled).toBe(
        true,
      );

      down.focus();
      down.click();
      expect(
        rows().map(
          (row) => row.querySelector<HTMLInputElement>('.regex')!.value,
        ),
      ).toEqual(['second', 'first']);
      expect(first.querySelector<HTMLButtonElement>('.move-down')!.disabled).toBe(
        true,
      );
      expect(document.activeElement).toBe(
        first.querySelector<HTMLButtonElement>('.move-up'),
      );
      expect(updateDynamicRules).not.toHaveBeenCalled();

      document.querySelector<HTMLFormElement>('#form')!.requestSubmit();
      await vi.waitFor(() =>
        expect(updateDynamicRules).toHaveBeenCalledOnce(),
      );
      expect(
        updateDynamicRules.mock.calls[0]![0].addRules.map(
          (rule: {
            condition: { regexFilter: string };
            priority: number;
          }) => [rule.condition.regexFilter, rule.priority],
        ),
      ).toEqual([
        ['second', 2],
        ['first', 1],
      ]);
    });

    it('updates controls after adding and removing rows', () => {
      const rows = () => [
        ...document.querySelectorAll<HTMLDivElement>('.rule-row'),
      ];

      document.querySelector<HTMLButtonElement>('#add')!.click();
      expect(rows()).toHaveLength(3);
      const added = rows()[2]!;
      expect(added.querySelector<HTMLButtonElement>('.move-down')!.disabled).toBe(
        true,
      );

      added.querySelector<HTMLButtonElement>('.move-up')!.click();
      expect(rows()[1]).toBe(added);

      added.querySelector<HTMLButtonElement>('.remove')!.click();
      expect(rows()).toHaveLength(2);
      expect(rows()[1]!.querySelector<HTMLButtonElement>('.move-down')!.disabled).toBe(
        true,
      );
    });
  });

  describe('playground input', () => {
    it.each([
      'not a URL',
      'example.com',
      'ftp://example.com/',
      'javascript:alert(1)',
    ])('rejects invalid Playground input: %s', (url) => {
      getDynamicRules.mockClear();
      document.querySelector<HTMLInputElement>('#playground-url')!.value = url;
      document.querySelector<HTMLButtonElement>('#playground-run')!.click();

      expect(
        document.querySelector<HTMLTextAreaElement>('#playground-result')!
          .value,
      ).toContain('options_playground_invalidInput');
      expect(getDynamicRules).not.toHaveBeenCalled();
    });

    it('runs the Playground for a valid HTTP URL', async () => {
      getDynamicRules.mockClear();
      document.querySelector<HTMLInputElement>('#playground-url')!.value =
        'http://example.com/';
      document.querySelector<HTMLButtonElement>('#playground-run')!.click();
      await vi.waitFor(() =>
        expect(getDynamicRules).toHaveBeenCalledOnce(),
      );
      await vi.waitFor(() =>
        expect(
          document.querySelector<HTMLButtonElement>('#playground-run')!.disabled,
        ).toBe(false),
      );

      const result = document.querySelector<HTMLTextAreaElement>(
        '#playground-result',
      )!;
      expect(result.value).toContain('options_playground_noMatch');
      expect(result.value).toContain('options_playground_lineMiss');
      expect(result.className).toBe('');
    });
  });
});
