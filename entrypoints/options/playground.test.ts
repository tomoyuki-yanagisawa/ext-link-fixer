import { describe, expect, it } from 'vitest';
import { evaluateRules, followRedirects, normalizeUrl } from './playground';

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
      { status: 'applied', result: 'https://example.com/new/123' },
      { status: 'skipped', result: 'https://other.example/OLD/123' },
      { status: 'unmatched' },
    ]);
  });

  it('replaces only the first matching part', () => {
    expect(evaluateRules('https://example.com/a/a', [
      { regex: '/a', substitution: '/b' },
    ])).toEqual([
      { status: 'applied', result: 'https://example.com/b/a' },
    ]);
  });
});


describe('followRedirects', () => {
  const rules = [
    { regex: '^https://a/', substitution: 'https://b/' },
    { regex: '^https://b/', substitution: 'https://c/' },
  ];

  it('allows a chain that stops at the rule count', () => {
    expect(followRedirects('https://a/', rules)).toEqual({
      steps: [{ line: 1, url: 'https://b/' }, { line: 2, url: 'https://c/' }],
      exceeded: false,
    });
  });

  it('reports a chain continuing beyond the rule count', () => {
    expect(followRedirects('https://a/', [
      { regex: '^https://a/', substitution: 'https://b/' },
      { regex: '^https://b/', substitution: 'https://a/' },
    ]).exceeded).toBe(true);
  });

  it('accepts a single redirect that terminates', () => {
    expect(followRedirects('https://a/', rules.slice(0, 1)).exceeded).toBe(false);
  });

  it('stops when a result is not a valid URL', () => {
    expect(followRedirects('https://a/', [
      { regex: '^https://a/', substitution: 'invalid' },
    ])).toEqual({ steps: [{ line: 1, url: 'invalid' }], exceeded: false });
  });

  it('reports invalid saved expressions instead of treating them as unmatched', () => {
    expect(() => followRedirects('https://a/', [
      { regex: '(', substitution: 'https://b/' },
    ])).toThrow();
  });
});
