import { i18n } from '#i18n';
import { browser } from 'wxt/browser';
import { localize } from '@/utils/i18n-dom';
import { evaluateRules, formatOutcome, normalizeUrl } from './playground';
import { hasHostAccess, requestHostAccess } from './permissions';
import { loadSavedRules, toDynamicRules, verifyRegex } from './rules';

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
const ruleTemplate = requiredElement<HTMLTemplateElement>(document, '#rule-template');
const playgroundUrlEl = requiredElement<HTMLInputElement>(document, '#playground-url');
const playgroundRunButton = requiredElement<HTMLButtonElement>(document, '#playground-run');
const playgroundResultEl = requiredElement<HTMLTextAreaElement>(document, '#playground-result');
const permissionStatusEl = requiredElement<HTMLParagraphElement>(document, '#permission-status');
const permissionRequestButton = requiredElement<HTMLButtonElement>(document, '#permission-request');

// <template> の中は document の対象外なので、行を複製する前に文言を置き換えておく。
localize();
localize(ruleTemplate.content);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type StatusKind = '' | 'error' | 'success';

function setStatusText(
  element: HTMLElement,
  message: string,
  kind: StatusKind = '',
) {
  element.className = kind ? `status ${kind}` : 'status';
  element.textContent = message;
}

function setStatus(message: string, kind: StatusKind = '') {
  setStatusText(statusEl, message, kind);
}

function createRow(regex = '', substitution = '') {
  const row = ruleTemplate.content.firstElementChild?.cloneNode(true);
  if (!(row instanceof HTMLDivElement)) {
    throw new Error('Rule template is missing');
  }

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

type RowEntry = {
  row: HTMLDivElement;
  regex: string;
  substitution: string;
};

function readRows(): RowEntry[] {
  return Array.from(
    rowsEl.querySelectorAll<HTMLDivElement>('.rule-row'),
  ).map((row) => ({
    row,
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
  setStatus(i18n.t('options.rules.loading'));

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
    setStatus(
      i18n.t('options.rules.loadFailed', { error: errorMessage(error) }),
      'error',
    );
    if (!rowsEl.children.length) {
      appendRow();
    }
  }
}

type RuleEntry = RowEntry & {
  line: number;
};

async function saveRules() {
  const entries: RuleEntry[] = [];

  for (const [index, row] of readRows().entries()) {
    const regexEmpty = row.regex.trim() === '';
    const substitutionEmpty = row.substitution.trim() === '';

    if (regexEmpty && substitutionEmpty) {
      continue;
    }
    if (regexEmpty || substitutionEmpty) {
      setStatus(
        i18n.t('options.rules.bothRequired', { line: index + 1 }),
        'error',
      );
      focusInput(row.row, regexEmpty ? '.regex' : '.substitution');
      return;
    }

    entries.push({ ...row, line: index + 1 });
  }

  for (const entry of entries) {
    const result = await verifyRegex(entry.regex);
    if (!result.isSupported) {
      setStatus(
        i18n.t('options.rules.unsupported', {
          line: entry.line,
          reason: result.reason ?? i18n.t('options.rules.unknownReason'),
        }),
        'error',
      );
      focusInput(entry.row, '.regex');
      return;
    }
  }

  saveButton.disabled = true;
  setStatus(i18n.t('options.rules.saving'));

  try {
    const addRules = toDynamicRules(
      entries.map(({ regex, substitution }) => ({ regex, substitution })),
    );

    const existingRules = await browser.declarativeNetRequest.getDynamicRules();
    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRules.map((rule) => rule.id),
      addRules,
    });

    setStatus(
      addRules.length
        ? i18n.t('options.rules.saved', { count: addRules.length })
        : i18n.t('options.rules.cleared'),
      'success',
    );
  } catch (error) {
    setStatus(
      i18n.t('options.rules.saveFailed', { error: errorMessage(error) }),
      'error',
    );
  } finally {
    saveButton.disabled = false;
  }
}

function showPlaygroundError(message: string) {
  playgroundResultEl.className = 'error';
  playgroundResultEl.value = i18n.t('options.playground.error', {
    message,
  });
}

async function runPlayground() {
  const url = playgroundUrlEl.value.trim();

  if (!url) {
    showPlaygroundError(i18n.t('options.playground.urlRequired'));
    return;
  }

  playgroundRunButton.disabled = true;
  playgroundResultEl.className = '';

  try {
    const rules = await loadSavedRules();

    if (!rules.length) {
      playgroundResultEl.value = i18n.t('options.playground.empty');
      return;
    }

    const target = normalizeUrl(url);
    const lines: string[] = [];

    if (target.hadFragment) {
      lines.push(i18n.t('options.playground.fragmentIgnored'));
    }

    const outcomes = evaluateRules(target.url, rules);

    if (!outcomes.some((outcome) => outcome.matched)) {
      lines.push(i18n.t('options.playground.noMatch'));
    }

    outcomes.forEach((outcome, index) => {
      lines.push(formatOutcome(outcome, index, target.url));
    });

    playgroundResultEl.value = lines.join('\n');
  } catch (error) {
    showPlaygroundError(
      i18n.t('options.playground.failed', { error: errorMessage(error) }),
    );
  } finally {
    playgroundRunButton.disabled = false;
  }
}

function setPermissionState(granted: boolean) {
  permissionRequestButton.disabled = granted;
  setStatusText(
    permissionStatusEl,
    i18n.t(
      granted ? 'options.siteAccess.granted' : 'options.siteAccess.denied',
    ),
    granted ? 'success' : 'error',
  );
}

async function updatePermissionState() {
  setPermissionState(await hasHostAccess());
}

permissionRequestButton.addEventListener('click', async () => {
  permissionRequestButton.disabled = true;

  try {
    if (await requestHostAccess()) {
      setPermissionState(true);
      return;
    }
  } catch {
    // 失敗時も下の案内にまとめる
  }

  permissionRequestButton.disabled = false;
  setStatusText(
    permissionStatusEl,
    i18n.t('options.siteAccess.failed'),
    'error',
  );
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
