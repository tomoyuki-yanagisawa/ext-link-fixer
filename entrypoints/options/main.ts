import { browser } from 'wxt/browser';

type DynamicRule = NonNullable<
  Parameters<typeof browser.declarativeNetRequest.updateDynamicRules>[0]['addRules']
>[number];

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  return element;
}

const formEl = requiredElement<HTMLFormElement>(document, '#form');
const rowsEl = requiredElement<HTMLDivElement>(document, '#rows');
const statusEl = requiredElement<HTMLParagraphElement>(document, '#status');
const addButton = requiredElement<HTMLButtonElement>(document, '#add');
const saveButton = requiredElement<HTMLButtonElement>(document, '#save');
const playgroundUrlEl = requiredElement<HTMLInputElement>(document, '#playground-url');
const playgroundRunButton = requiredElement<HTMLButtonElement>(document, '#playground-run');
const playgroundResultEl = requiredElement<HTMLParagraphElement>(document, '#playground-result');
const permissionStatusEl = requiredElement<HTMLParagraphElement>(document, '#permission-status');
const permissionRequestButton = requiredElement<HTMLButtonElement>(document, '#permission-request');

const ORIGINS = ['http://*/*', 'https://*/*'];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setStatus(message: string, isError = false) {
  statusEl.textContent = isError ? `エラー: ${message}` : message;
}

function createRow(regex = '', substitution = '') {
  const row = document.createElement('div');
  row.className = 'rule-row';
  row.innerHTML = `
    <input type="text" class="regex" aria-label="マッチする正規表現"
           spellcheck="false" autocomplete="off"
           placeholder="^https://example\\.com/search\\?q=(.*)$" />
    <input type="text" class="substitution" aria-label="置換後の URL"
           spellcheck="false" autocomplete="off"
           placeholder="https://example.com/find?query=\\1" />
    <button type="button" class="remove">削除</button>
  `;

  requiredElement<HTMLInputElement>(row, '.regex').value = regex;
  requiredElement<HTMLInputElement>(row, '.substitution').value = substitution;

  requiredElement<HTMLButtonElement>(row, '.remove').addEventListener('click', () => {
    row.remove();
    if (!rowsEl.children.length) {
      const next = createRow();
      rowsEl.append(next);
      requiredElement<HTMLInputElement>(next, '.regex').focus();
    }
  });

  return row;
}

function appendRow(regex?: string, substitution?: string) {
  const row = createRow(regex, substitution);
  rowsEl.append(row);
  return row;
}

function readRows() {
  return Array.from(rowsEl.querySelectorAll('.rule-row')).map((row) => ({
    regex: requiredElement<HTMLInputElement>(row, '.regex').value,
    substitution: requiredElement<HTMLInputElement>(row, '.substitution').value,
  }));
}

function focusInput(row: Element | undefined, selector: string) {
  const target = row?.querySelector<HTMLInputElement>(selector);
  if (target) {
    target.focus();
    target.select();
  }
}

async function loadRules() {
  setStatus('読み込み中…');

  try {
    const rules = await browser.declarativeNetRequest.getDynamicRules();
    rules.sort((a, b) => a.id - b.id);

    rowsEl.replaceChildren();
    for (const rule of rules) {
      appendRow(
        rule.condition?.regexFilter ?? '',
        rule.action?.redirect?.regexSubstitution ?? '',
      );
    }
    if (!rules.length) {
      appendRow();
    }

    setStatus('');
  } catch (error) {
    setStatus(`ルールの読み込みに失敗しました: ${errorMessage(error)}`, true);
    if (!rowsEl.children.length) {
      appendRow();
    }
  }
}

async function verifyRegex(regex: string) {
  try {
    return await browser.declarativeNetRequest.isRegexSupported({
      regex,
      requireCapturing: true,
    });
  } catch (error) {
    return { isSupported: false, reason: errorMessage(error) };
  }
}

async function saveRules() {
  const rows = readRows();
  const entries = [];
  const rowElements = Array.from(rowsEl.querySelectorAll('.rule-row'));

  for (const [index, row] of rows.entries()) {
    const regex = row.regex;
    const substitution = row.substitution;
    const regexEmpty = regex.trim() === '';
    const substitutionEmpty = substitution.trim() === '';

    if (regexEmpty && substitutionEmpty) {
      continue;
    }
    if (regexEmpty || substitutionEmpty) {
      setStatus(
        `${index + 1} 行目: 正規表現と置換後の URL の両方を入力してください。`,
        true,
      );
      focusInput(rowElements[index], regexEmpty ? '.regex' : '.substitution');
      return;
    }

    entries.push({ regex, substitution, index });
  }

  for (const entry of entries) {
    const result = await verifyRegex(entry.regex);
    if (!result.isSupported) {
      setStatus(
        `${entry.index + 1} 行目の正規表現がサポートされていません: ${result.reason ?? '理由不明'}`,
        true,
      );
      focusInput(rowElements[entry.index], '.regex');
      return;
    }
  }

  saveButton.disabled = true;
  setStatus('保存中…');

  try {
    const addRules: DynamicRule[] = entries.map((entry, index) => ({
      id: index + 1,
      // 並び順が上のルールほど優先度を高くする。
      priority: entries.length - index,
      condition: {
        regexFilter: entry.regex,
        resourceTypes: ['main_frame'],
      },
      action: {
        type: 'redirect',
        redirect: { regexSubstitution: entry.substitution },
      },
    }));

    const existingRules = await browser.declarativeNetRequest.getDynamicRules();
    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRules.map((rule) => rule.id),
      addRules,
    });

    setStatus(
      addRules.length
        ? `${addRules.length} 件のルールを保存しました。`
        : 'すべてのルールを削除しました。',
    );
  } catch (error) {
    setStatus(`保存に失敗しました: ${errorMessage(error)}`, true);
  } finally {
    saveButton.disabled = false;
  }
}

type MatchingRule = {
  id: number;
  regex: string;
  substitution: string;
};

type RuleOutcome = {
  rule: MatchingRule;
  matched: boolean;
  applied: boolean;
  /** 書き換え後の URL。マッチしていない、または計算できない場合は null。 */
  result: string | null;
};

type NormalizedUrl = {
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
function normalizeUrl(input: string): NormalizedUrl {
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
function evaluateRules(url: string, rules: MatchingRule[]): RuleOutcome[] {
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

type SavedRule = MatchingRule & {
  priority: number;
};

async function loadSavedRules(): Promise<SavedRule[]> {
  const rules = await browser.declarativeNetRequest.getDynamicRules();

  return rules
    .map((rule) => ({
      id: rule.id,
      priority: rule.priority ?? 0,
      regex: rule.condition?.regexFilter ?? '',
      substitution: rule.action?.redirect?.regexSubstitution ?? '',
    }))
    .filter((rule) => rule.regex !== '' && rule.substitution !== '')
    .sort((a, b) => b.priority - a.priority);
}

function createCode(text: string) {
  const element = document.createElement('code');
  element.textContent = text;
  return element;
}

function showPlaygroundError(message: string) {
  playgroundResultEl.replaceChildren(`エラー: ${message}`);
}

async function runPlayground() {
  const url = playgroundUrlEl.value.trim();

  if (!url) {
    showPlaygroundError('試す URL を入力してください。');
    return;
  }

  playgroundRunButton.disabled = true;

  try {
    const rules = await loadSavedRules();

    if (!rules.length) {
      playgroundResultEl.replaceChildren('保存済みのルールがありません。');
      return;
    }

    const target = normalizeUrl(url);
    const notes: HTMLParagraphElement[] = [];

    if (target.hadFragment) {
      const note = document.createElement('p');
      note.textContent =
        '# 以降はネットワークリクエストに含まれないため、判定から除外しています。';
      notes.push(note);
    }

    const outcomes = evaluateRules(target.url, rules);

    if (!outcomes.some((outcome) => outcome.matched)) {
      const note = document.createElement('p');
      note.textContent = 'どのルールにもマッチしませんでした。';
      notes.push(note);
    }

    const list = document.createElement('ul');

    outcomes.forEach((outcome, index) => {
      const item = document.createElement('li');
      item.append(`${index + 1} 行目 `);

      if (!outcome.matched) {
        item.append('マッチしない');
        list.append(item);
        return;
      }

      if (outcome.applied) {
        item.append('適用');
      } else {
        item.append('マッチ（優先度が低いため適用されない）');
      }

      if (outcome.result === null) {
        item.append('（書き換え結果を計算できませんでした）');
        list.append(item);
        return;
      }

      item.append(': ', createCode(outcome.result));

      if (outcome.result === target.url) {
        item.append('（URL は変わりません）');
      } else {
        try {
          new URL(outcome.result);
        } catch {
          item.append('（有効な URL ではありません）');
        }
      }

      list.append(item);
    });

    playgroundResultEl.replaceChildren(...notes, list);
  } catch (error) {
    showPlaygroundError(`シミュレーションに失敗しました: ${errorMessage(error)}`);
  } finally {
    playgroundRunButton.disabled = false;
  }
}

async function hasHostAccess() {
  try {
    return await browser.permissions.contains({ origins: ORIGINS });
  } catch {
    return true;
  }
}

function setPermissionState(granted: boolean) {
  permissionRequestButton.disabled = granted;
  permissionStatusEl.textContent = granted
    ? 'サイトアクセスは許可されています。'
    : 'サイトアクセスが許可されていません。URL の書き換えには許可が必要です。';
}

async function updatePermissionState() {
  setPermissionState(await hasHostAccess());
}

permissionRequestButton.addEventListener('click', async () => {
  permissionRequestButton.disabled = true;

  try {
    if (await browser.permissions.request({ origins: ORIGINS })) {
      setPermissionState(true);
      return;
    }
  } catch {
    // 失敗時も下の案内にまとめる
  }

  permissionRequestButton.disabled = false;
  permissionStatusEl.textContent =
    'サイトアクセスを許可できませんでした。ブラウザの拡張機能の設定から許可してください。';
});

addButton.addEventListener('click', () => {
  const row = appendRow();
  requiredElement<HTMLInputElement>(row, '.regex').focus();
});

formEl.addEventListener('submit', (event) => {
  event.preventDefault();
  saveRules();
});

playgroundRunButton.addEventListener('click', runPlayground);

playgroundUrlEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    runPlayground();
  }
});

loadRules();
updatePermissionState();
