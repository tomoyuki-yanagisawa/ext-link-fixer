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

const body = /<html[^>]*>([\s\S]*)<\/html>/.exec(html)?.[1];

function resetDocument() {
  if (!body) {
    throw new Error('options/index.html: <html> not found');
  }
  document.documentElement.innerHTML = body;
}

type AddedRule = {
  condition: { regexFilter: string };
  priority: number;
};

describe('options page', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    resetDocument();
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
      const moveUp = first.querySelector<HTMLButtonElement>('.move-up')!;
      const moveDown = first.querySelector<HTMLButtonElement>('.move-down')!;

      expect(moveUp.disabled).toBe(true);

      moveDown.focus();
      moveDown.click();
      expect(
        rows().map(
          (row) => row.querySelector<HTMLInputElement>('.regex')!.value,
        ),
      ).toEqual(['second', 'first']);
      expect(moveDown.disabled).toBe(true);
      expect(document.activeElement).toBe(moveUp);
      expect(updateDynamicRules).not.toHaveBeenCalled();

      document.querySelector<HTMLFormElement>('#form')!.requestSubmit();
      await vi.waitFor(() =>
        expect(updateDynamicRules).toHaveBeenCalledOnce(),
      );

      const [call] = updateDynamicRules.mock.calls;
      const addedRules = call![0].addRules as AddedRule[];
      expect(
        addedRules.map(({ condition, priority }) => [
          condition.regexFilter,
          priority,
        ]),
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
      const addedDown = added.querySelector<HTMLButtonElement>('.move-down')!;
      expect(addedDown.disabled).toBe(true);

      added.querySelector<HTMLButtonElement>('.move-up')!.click();
      expect(rows()[1]).toBe(added);

      added.querySelector<HTMLButtonElement>('.remove')!.click();
      expect(rows()).toHaveLength(2);
      const lastDown = rows()[1]!.querySelector<HTMLButtonElement>('.move-down')!;
      expect(lastDown.disabled).toBe(true);
    });
  });

  describe('playground input', () => {
    it.each([
      ['', 'options_playground_urlRequired'],
      ['not a URL', 'options_playground_invalidInput'],
      ['example.com', 'options_playground_invalidInput'],
      ['ftp://example.com/', 'options_playground_invalidInput'],
      ['javascript:alert(1)', 'options_playground_invalidInput'],
    ])('rejects invalid Playground input: %s', (url, expected) => {
      // マウント時の loadRules() による呼び出しを除外する。
      getDynamicRules.mockClear();
      document.querySelector<HTMLInputElement>('#playground-url')!.value = url;
      document.querySelector<HTMLButtonElement>('#playground-run')!.click();

      expect(
        document.querySelector<HTMLTextAreaElement>('#playground-result')!
          .value,
      ).toContain(expected);
      expect(getDynamicRules).not.toHaveBeenCalled();
    });

    it('runs the Playground for a valid HTTP URL', async () => {
      getDynamicRules.mockClear();
      document.querySelector<HTMLInputElement>('#playground-url')!.value =
        'http://example.com/';
      document.querySelector<HTMLButtonElement>('#playground-run')!.click();
      await vi.waitFor(() =>
        expect(
          document.querySelector<HTMLButtonElement>('#playground-run')!.disabled,
        ).toBe(false),
      );
      expect(getDynamicRules).toHaveBeenCalledOnce();

      const result = document.querySelector<HTMLTextAreaElement>(
        '#playground-result',
      )!;
      expect(result.value).toContain('options_playground_noMatch');
      expect(result.value).toContain('options_playground_lineMiss');
      expect(result.className).toBe('');
    });
  });
});
