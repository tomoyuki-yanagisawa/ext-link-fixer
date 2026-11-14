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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setStatus(message: string, kind: '' | 'error' | 'ok' = '') {
  statusEl.textContent = message;
  statusEl.className = kind;
}

function createRow(regex = '', substitution = '') {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <div>
      <label>マッチする正規表現</label>
      <input type="text" class="regex" spellcheck="false" autocomplete="off"
             placeholder="^https://example\\.com/old/(.*)$" />
    </div>
    <div>
      <label>置換後の URL</label>
      <input type="text" class="substitution" spellcheck="false" autocomplete="off"
             placeholder="https://example.com/new/\\1" />
    </div>
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
  return Array.from(rowsEl.querySelectorAll('.row')).map((row) => ({
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
    setStatus(`ルールの読み込みに失敗しました: ${errorMessage(error)}`, 'error');
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
  const rowElements = Array.from(rowsEl.querySelectorAll('.row'));

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
        'error',
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
        'error',
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
      'ok',
    );
  } catch (error) {
    setStatus(`保存に失敗しました: ${errorMessage(error)}`, 'error');
  } finally {
    saveButton.disabled = false;
  }
}

addButton.addEventListener('click', () => {
  const row = appendRow();
  requiredElement<HTMLInputElement>(row, '.regex').focus();
});

formEl.addEventListener('submit', (event) => {
  event.preventDefault();
  saveRules();
});

loadRules();
