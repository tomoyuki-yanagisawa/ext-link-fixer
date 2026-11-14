export type MatchingRule = {
  id: number;
  regex: string;
  substitution: string;
};

export type RuleOutcome = {
  rule: MatchingRule;
  matched: boolean;
  applied: boolean;
  /** 書き換え後の URL。マッチしていない、または計算できない場合は null。 */
  result: string | null;
};

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
export function evaluateRules(url: string, rules: MatchingRule[]): RuleOutcome[] {
  let applied = false;

  return rules.map((rule) => {
    let match: RegExpExecArray | null;
    try {
      match = new RegExp(rule.regex, 'i').exec(url);
    } catch {
      match = null;
    }

    if (!match) {
      return { rule, matched: false, applied: false, result: null };
    }

    const result = substituteFirstMatch(url, match, rule.substitution);
    const isApplied = !applied;
    if (isApplied) {
      applied = true;
    }

    return { rule, matched: true, applied: isApplied, result };
  });
}

/** 1 ルール分の結果を、Playground に表示する 1 行へ整形する。 */
export function formatOutcome(
  outcome: RuleOutcome,
  index: number,
  targetUrl: string,
): string {
  const label = `${index + 1} 行目`;

  if (!outcome.matched) {
    return `${label} マッチしない`;
  }

  const status = outcome.applied
    ? '適用'
    : 'マッチ（優先度が低いため適用されない）';

  if (outcome.result === null) {
    return `${label} ${status}: （書き換え結果を計算できませんでした）`;
  }

  let line = `${label} ${status}: ${outcome.result}`;

  if (outcome.result === targetUrl) {
    line += '（URL は変わりません）';
  } else {
    try {
      new URL(outcome.result);
    } catch {
      line += '（有効な URL ではありません）';
    }
  }

  return line;
}
