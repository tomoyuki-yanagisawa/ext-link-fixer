import { describe, expect, it } from 'vitest';
import { evaluateRules, normalizeUrl } from './playground';

describe('normalizeUrl', () => {
  it('normalizes a URL and removes its fragment', () => {
    expect(normalizeUrl('https://EXAMPLE.com/hello world#section')).toEqual({
      url: 'https://example.com/hello%20world',
      hadFragment: true,
    });
  });

  it('preserves input that cannot be parsed as a URL', () => {
    expect(normalizeUrl('not a URL')).toEqual({ url: 'not a URL', hadFragment: false });
  });
});

describe('evaluateRules', () => {
  it('matches case-insensitively, substitutes captures, and applies the first match', () => {
    const outcomes = evaluateRules('https://example.com/OLD/123', [
      { regex: '^https://example\\.com/old/(.*)$', substitution: 'https://example.com/new/\\1' },
      { regex: '^https://example\\.com/(.*)$', substitution: 'https://other.example/\\1' },
      { regex: '^https://unmatched\\.example/', substitution: 'https://other.example/' },
    ]);

    expect(outcomes).toEqual([
      { matched: true, applied: true, result: 'https://example.com/new/123' },
      { matched: true, applied: false, result: 'https://other.example/OLD/123' },
      { matched: false, applied: false, result: null },
    ]);
  });

  it('replaces only the first matching part', () => {
    expect(evaluateRules('https://example.com/a/a', [
      { regex: '/a', substitution: '/b' },
    ])).toEqual([
      { matched: true, applied: true, result: 'https://example.com/b/a' },
    ]);
  });
});
