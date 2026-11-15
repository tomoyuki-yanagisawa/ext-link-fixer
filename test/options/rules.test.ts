import { describe, expect, it, vi } from 'vitest';
import {
  loadSavedRules,
  toDynamicRules,
  verifyRegex,
} from '../../entrypoints/options/rules';

const { isRegexSupported, getDynamicRules } = vi.hoisted(() => ({
  isRegexSupported: vi.fn(),
  getDynamicRules: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    declarativeNetRequest: { isRegexSupported, getDynamicRules },
  },
}));

describe('verifyRegex', () => {
  it('rejects an expression JavaScript cannot parse', async () => {
    isRegexSupported.mockClear();
    expect((await verifyRegex('(?P<name>.+)')).isSupported).toBe(false);
    expect(isRegexSupported).not.toHaveBeenCalled();
  });

  it('rejects an expression unsupported by DNR', async () => {
    isRegexSupported.mockResolvedValueOnce({
      isSupported: false,
      reason: 'syntaxError',
    });
    expect(await verifyRegex('(?=a)')).toEqual({
      isSupported: false,
      reason: 'syntaxError',
    });
  });

  it('accepts an expression supported by both engines', async () => {
    isRegexSupported.mockResolvedValueOnce({ isSupported: true });
    expect(await verifyRegex('^https://example\\.com/')).toEqual({
      isSupported: true,
    });
    expect(isRegexSupported).toHaveBeenLastCalledWith({
      regex: '^https://example\\.com/',
      requireCapturing: true,
    });
  });
});

describe('loadSavedRules', () => {
  it('maps redirect rules and sorts them by id', async () => {
    getDynamicRules.mockResolvedValueOnce([
      {
        id: 2,
        condition: { regexFilter: '^https://b/' },
        action: { redirect: { regexSubstitution: 'https://c/' } },
      },
      {
        id: 1,
        condition: { regexFilter: '^https://a/' },
        action: { redirect: { regexSubstitution: 'https://b/' } },
      },
    ]);

    expect(await loadSavedRules()).toEqual([
      { id: 1, regex: '^https://a/', substitution: 'https://b/' },
      { id: 2, regex: '^https://b/', substitution: 'https://c/' },
    ]);
  });
});

describe('toDynamicRules', () => {
  it('assigns higher priority to rules earlier in the list', () => {
    const rules = toDynamicRules([
      { regex: '^https://a/(.*)$', substitution: 'https://b/\\1' },
      { regex: '^https://c/(.*)$', substitution: 'https://d/\\1' },
    ]);

    expect(rules).toEqual([
      {
        id: 1,
        priority: 2,
        condition: {
          regexFilter: '^https://a/(.*)$',
          resourceTypes: ['main_frame'],
        },
        action: {
          type: 'redirect',
          redirect: { regexSubstitution: 'https://b/\\1' },
        },
      },
      {
        id: 2,
        priority: 1,
        condition: {
          regexFilter: '^https://c/(.*)$',
          resourceTypes: ['main_frame'],
        },
        action: {
          type: 'redirect',
          redirect: { regexSubstitution: 'https://d/\\1' },
        },
      },
    ]);
  });

  it('returns no rules for an empty list', () => {
    expect(toDynamicRules([])).toEqual([]);
  });
});
