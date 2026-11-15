import { browser } from 'wxt/browser';
import { localize } from '@/utils/i18n';
import { evaluateRules, followRedirects, formatOutcome, normalizeUrl } from './playground';
import { hasHostAccess, requestHostAccess } from './permissions';
import { loadSavedRules, toDynamicRules, verifyRegex } from './rules';

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  return element;
}

const formEl = requiredElement<HTMLFormElement>(document, '#form');
const rulesFieldset = requiredElement<HTMLFieldSetElement>(formEl, 'fieldset');
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

function updateMoveButtons() {
  for (const row of rowsEl.children) {
    requiredElement<HTMLButtonElement>(row, '.move-up').disabled = !row.previousElementSibling;
    requiredElement<HTMLButtonElement>(row, '.move-down').disabled = !row.nextElementSibling;
  }
}

function createRow(regex = '', substitution = '') {
  const row = ruleTemplate.content.firstElementChild?.cloneNode(true);
  if (!(row instanceof HTMLDivElement)) {
    throw new Error('Rule template is missing');
  }

  requiredElement<HTMLInputElement>(row, '.regex').value = regex;
  requiredElement<HTMLInputElement>(row, '.substitution').value = substitution;

  const up = requiredElement<HTMLButtonElement>(row, '.move-up');
  const down = requiredElement<HTMLButtonElement>(row, '.move-down');

  up.addEventListener('click', () => {
    const previous = row.previousElementSibling;
    if (!previous) return;
    previous.before(row);
    updateMoveButtons();
    (up.disabled ? down : up).focus();
    setStatus('');
  });

  down.addEventListener('click', () => {
    const next = row.nextElementSibling;
    if (!next) return;
    next.after(row);
    updateMoveButtons();
    (down.disabled ? up : down).focus();
    setStatus('');
  });

  requiredElement<HTMLButtonElement>(row, '.remove').addEventListener('click', () => {
    row.remove();
    if (!rowsEl.children.length) {
      const next = createRow();
      rowsEl.append(next);
      requiredElement<HTMLInputElement>(next, '.regex').focus();
    }
    updateMoveButtons();
  });

  return row;
}

function appendRow(regex?: string, substitution?: string) {
  const row = createRow(regex, substitution);
  rowsEl.append(row);
  updateMoveButtons();
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

let rulesReady = false;
let saving = false;

function setRulesDisabled(disabled: boolean) {
  rulesFieldset.disabled = disabled;
  saveButton.disabled = disabled;
}

async function loadRules() {
  setRulesDisabled(true);
  setStatus(browser.i18n.getMessage('options_rules_loading'));

  try {
    const rules = await loadSavedRules();

    rowsEl.replaceChildren();
    for (const rule of rules) {
      appendRow(rule.regex, rule.substitution);
    }
    if (!rules.length) {
      appendRow();
    }

    rulesReady = true;
    setRulesDisabled(false);
    setStatus('');
  } catch (error) {
    setStatus(
      browser.i18n.getMessage('options_rules_loadFailed', [errorMessage(error)]),
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
  if (!rulesReady || saving) return;
  saving = true;
  setRulesDisabled(true);

  try {
    const entries: RuleEntry[] = [];

    for (const [index, row] of readRows().entries()) {
      const regexEmpty = row.regex.trim() === '';
      const substitutionEmpty = row.substitution.trim() === '';

      if (regexEmpty && substitutionEmpty) {
        continue;
      }
      if (regexEmpty || substitutionEmpty) {
        setStatus(
          browser.i18n.getMessage('options_rules_bothRequired', [String(index + 1)]),
          'error',
        );
        setRulesDisabled(false);
        focusInput(row.row, regexEmpty ? '.regex' : '.substitution');
        return;
      }

      entries.push({ ...row, line: index + 1 });
    }

    for (const entry of entries) {
      const result = await verifyRegex(entry.regex);
      if (!result.isSupported) {
        setStatus(
          browser.i18n.getMessage('options_rules_unsupported', [
            String(entry.line),
            result.reason ?? browser.i18n.getMessage('options_rules_unknownReason'),
          ]),
          'error',
        );
        setRulesDisabled(false);
        focusInput(entry.row, '.regex');
        return;
      }
    }

    setStatus(browser.i18n.getMessage('options_rules_saving'));

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
        ? browser.i18n.getMessage('options_rules_saved', [String(addRules.length)])
        : browser.i18n.getMessage('options_rules_cleared'),
      'success',
    );
  } catch (error) {
    setStatus(
      browser.i18n.getMessage('options_rules_saveFailed', [errorMessage(error)]),
      'error',
    );
  } finally {
    saving = false;
    setRulesDisabled(false);
  }
}

function showPlaygroundError(message: string) {
  playgroundResultEl.className = 'error';
  playgroundResultEl.value = browser.i18n.getMessage('options_playground_error', [message]);
}

async function runPlayground() {
  const url = playgroundUrlEl.value.trim();

  if (!url) {
    showPlaygroundError(browser.i18n.getMessage('options_playground_urlRequired'));
    return;
  }

  playgroundRunButton.disabled = true;
  playgroundResultEl.className = '';

  try {
    const rules = (await loadSavedRules()).filter(
      (rule) => rule.regex !== '' && rule.substitution !== '',
    );

    if (!rules.length) {
      playgroundResultEl.value = browser.i18n.getMessage('options_playground_empty');
      return;
    }

    const target = normalizeUrl(url);
    const lines: string[] = [];

    if (target.hadFragment) {
      lines.push(browser.i18n.getMessage('options_playground_fragmentIgnored'));
    }

    const outcomes = evaluateRules(target.url, rules);

    if (!outcomes.some((outcome) => outcome.status !== 'unmatched')) {
      lines.push(browser.i18n.getMessage('options_playground_noMatch'));
    }

    outcomes.forEach((outcome, index) => {
      lines.push(formatOutcome(outcome, index, target.url));
    });

    const chain = followRedirects(target.url, rules);
    chain.steps.slice(1).forEach((step, index) => {
      lines.push(browser.i18n.getMessage('options_playground_chainStep', [
        String(index + 2), String(step.line), step.url,
      ]));
    });
    if (chain.exceeded) {
      playgroundResultEl.className = 'error';
      lines.push(browser.i18n.getMessage('options_playground_chainLimit', [String(rules.length)]));
    }

    playgroundResultEl.value = lines.join('\n');
  } catch (error) {
    showPlaygroundError(
      browser.i18n.getMessage('options_playground_failed', [errorMessage(error)]),
    );
  } finally {
    playgroundRunButton.disabled = false;
  }
}

function setPermissionState(granted: boolean) {
  permissionRequestButton.disabled = granted;
  setStatusText(
    permissionStatusEl,
    browser.i18n.getMessage(granted ? 'options_siteAccess_granted' : 'options_siteAccess_denied'),
    granted ? 'success' : 'error',
  );
}

async function updatePermissionState() {
  try {
    setPermissionState(await hasHostAccess());
  } catch {
    permissionRequestButton.disabled = false;
    setStatusText(permissionStatusEl, browser.i18n.getMessage('options_siteAccess_checkFailed'), 'error');
  }
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
    browser.i18n.getMessage('options_siteAccess_failed'),
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
