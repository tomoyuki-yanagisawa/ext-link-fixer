import { describe, expect, it, vi } from 'vitest';
import { toDynamicRules, verifyRegex } from './rules';

const { isRegexSupported } = vi.hoisted(() => ({ isRegexSupported: vi.fn() }));
vi.mock('wxt/browser', () => ({
  browser: { declarativeNetRequest: { isRegexSupported } },
}));

describe('verifyRegex', () => {
  it('rejects an expression JavaScript cannot parse', async () => {
    isRegexSupported.mockClear();
    expect((await verifyRegex('(?P<name>.+)')).isSupported).toBe(false);
    expect(isRegexSupported).not.toHaveBeenCalled();
  });

  it('rejects an expression unsupported by DNR', async () => {
    isRegexSupported.mockResolvedValueOnce({ isSupported: false, reason: 'syntaxError' });
    expect(await verifyRegex('(?=a)')).toEqual({ isSupported: false, reason: 'syntaxError' });
  });

  it('accepts an expression supported by both engines', async () => {
    isRegexSupported.mockResolvedValueOnce({ isSupported: true });
    expect(await verifyRegex('^https://example\\.com/')).toEqual({ isSupported: true });
    expect(isRegexSupported).toHaveBeenLastCalledWith({ regex: '^https://example\\.com/', requireCapturing: true });
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
        condition: { regexFilter: '^https://a/(.*)$', resourceTypes: ['main_frame'] },
        action: { type: 'redirect', redirect: { regexSubstitution: 'https://b/\\1' } },
      },
      {
        id: 2,
        priority: 1,
        condition: { regexFilter: '^https://c/(.*)$', resourceTypes: ['main_frame'] },
        action: { type: 'redirect', redirect: { regexSubstitution: 'https://d/\\1' } },
      },
    ]);
  });

  it('returns no rules for an empty list', () => {
    expect(toDynamicRules([])).toEqual([]);
  });
});
