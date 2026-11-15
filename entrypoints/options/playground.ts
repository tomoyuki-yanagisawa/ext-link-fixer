import { browser } from 'wxt/browser';
import type { RuleDraft } from './rules';

export type RuleOutcome =
  | { status: 'unmatched' }
  | { status: 'applied' | 'skipped'; result: string };

export type NormalizedUrl = {
  /** 実際のネットワークリクエストに近づけた URL。 */
  url: string;
  /** fragment が付いていたか。リクエストには含まれないため判定前に除去する。 */
  hadFragment: boolean;
};

/**
 * DNR のマッチ対象に近づける。
 *
 * - ホストの punycode 化や非 ASCII 文字のパーセントエンコードは `URL` に任せる
 * - fragment はネットワークリクエストに含まれないため取り除く
 */
export function normalizeUrl(input: string): NormalizedUrl {
  try {
    const parsed = new URL(input);
    const hadFragment = parsed.hash !== '';
    parsed.hash = '';
    return { url: parsed.href, hadFragment };
  } catch {
    return { url: input, hadFragment: false };
  }
}

// DNR と同じく、最初にマッチした箇所だけを \0〜\9 の参照で置き換える。
function substituteFirstMatch(
  url: string,
  match: RegExpExecArray,
  substitution: string,
) {
  const replaced = substitution.replace(
    /\\(\d)/g,
    (_, digit: string) => match[Number(digit)] ?? '',
  );

  return url.slice(0, match.index) + replaced + url.slice(match.index + match[0].length);
}

/**
 * URL に対してルールを評価する。rules は優先度の高い順に並べて渡す。
 *
 * DNR の `regexFilter` は既定で大文字小文字を区別しないため、`i` フラグで
 * 同じ挙動にしている。保存時に `isRegexSupported` で検証したルールが対象。
 */
export function evaluateRules(url: string, rules: RuleDraft[]): RuleOutcome[] {
  let applied = false;

  return rules.map((rule) => {
    const match = new RegExp(rule.regex, 'i').exec(url);

    if (!match) {
      return { status: 'unmatched' };
    }

    const result = substituteFirstMatch(url, match, rule.substitution);
    const isApplied = !applied;
    if (isApplied) {
      applied = true;
    }

    return { status: isApplied ? 'applied' : 'skipped', result };
  });
}

export function followRedirects(url: string, rules: RuleDraft[]) {
  const steps: { line: number; url: string }[] = [];
  let current = url;

  while (true) {
    const outcomes = evaluateRules(current, rules);
    const index = outcomes.findIndex((outcome) => outcome.status === 'applied');
    const outcome = outcomes[index];
    if (!outcome || outcome.status !== 'applied') return { steps, exceeded: false };
    if (steps.length >= rules.length) return { steps, exceeded: true };

    steps.push({ line: index + 1, url: outcome.result });
    try {
      const next = new URL(outcome.result);
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        return { steps, exceeded: false };
      }
      next.hash = '';
      current = next.href;
    } catch {
      return { steps, exceeded: false };
    }
  }
}

/** 1 ルール分の結果を、Playground に表示する 1 行へ整形する。 */
export function formatOutcome(
  outcome: RuleOutcome,
  index: number,
  targetUrl: string,
): string {
  const line = index + 1;

  if (outcome.status === 'unmatched') {
    return browser.i18n.getMessage('options_playground_lineMiss', [String(line)]);
  }

  const status = browser.i18n.getMessage(
    outcome.status === 'applied'
      ? 'options_playground_statusApplied'
      : 'options_playground_statusNotApplied',
  );

  const text = browser.i18n.getMessage('options_playground_lineResult', [String(line), status, outcome.result]);

  if (outcome.result === targetUrl) {
    return text + browser.i18n.getMessage('options_playground_unchanged');
  }

  try {
    new URL(outcome.result);
  } catch {
    return text + browser.i18n.getMessage('options_playground_invalidUrl');
  }

  return text;
}
