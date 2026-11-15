import { describe, expect, it } from 'vitest';
import { toDynamicRules } from './rules';

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
