// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import html from './index.html?raw';

const { getDynamicRules, updateDynamicRules } = vi.hoisted(() => ({
  getDynamicRules: vi.fn(),
  updateDynamicRules: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    i18n: { getUILanguage: () => 'en', getMessage: (key: string) => key },
    declarativeNetRequest: {
      getDynamicRules,
      updateDynamicRules,
      isRegexSupported: vi.fn().mockResolvedValue({ isSupported: true }),
    },
    permissions: { contains: vi.fn().mockResolvedValue(true) },
  },
}));

describe('rule ordering', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    document.documentElement.innerHTML = html.match(/<html[^>]*>([\s\S]*)<\/html>/)![1]!;
    getDynamicRules.mockResolvedValue([
      { id: 1, condition: { regexFilter: 'first' }, action: { redirect: { regexSubstitution: 'https://a/' } } },
      { id: 2, condition: { regexFilter: 'second' }, action: { redirect: { regexSubstitution: 'https://b/' } } },
    ]);
    updateDynamicRules.mockResolvedValue(undefined);
    await import('./main');
    await vi.waitFor(() => expect(document.querySelectorAll('.rule-row')).toHaveLength(2));
  });

  it('moves rows, updates boundary buttons, and saves the new order', async () => {
    const rows = () => [...document.querySelectorAll<HTMLDivElement>('.rule-row')];
    const first = rows()[0]!;
    const down = first.querySelector<HTMLButtonElement>('.move-down')!;
    expect(first.querySelector<HTMLButtonElement>('.move-up')!.disabled).toBe(true);
    down.focus();
    down.click();
    expect(rows().map((row) => row.querySelector<HTMLInputElement>('.regex')!.value)).toEqual(['second', 'first']);
    expect(first.querySelector<HTMLButtonElement>('.move-down')!.disabled).toBe(true);
    expect(document.activeElement).toBe(first.querySelector('.move-up'));
    expect(updateDynamicRules).not.toHaveBeenCalled();

    document.querySelector<HTMLFormElement>('#form')!.requestSubmit();
    await vi.waitFor(() => expect(updateDynamicRules).toHaveBeenCalledOnce());
    expect(updateDynamicRules.mock.calls[0]![0].addRules.map((rule: { condition: { regexFilter: string }; priority: number }) => [rule.condition.regexFilter, rule.priority])).toEqual([
      ['second', 2], ['first', 1],
    ]);
  });

  it('updates controls after adding and removing rows', () => {
    const rows = () => [...document.querySelectorAll<HTMLDivElement>('.rule-row')];
    document.querySelector<HTMLButtonElement>('#add')!.click();
    expect(rows()).toHaveLength(3);
    const added = rows()[2]!;
    expect(added.querySelector<HTMLButtonElement>('.move-down')!.disabled).toBe(true);
    added.querySelector<HTMLButtonElement>('.move-up')!.click();
    expect(rows()[1]).toBe(added);
    added.querySelector<HTMLButtonElement>('.remove')!.click();
    expect(rows()).toHaveLength(2);
    expect(rows()[1]!.querySelector<HTMLButtonElement>('.move-down')!.disabled).toBe(true);
  });
});
