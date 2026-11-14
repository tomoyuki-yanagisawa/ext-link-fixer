import { browser } from 'wxt/browser';
import type { Browser } from 'wxt/browser';

export type SavedRule = {
  id: number;
  priority: number;
  regex: string;
  substitution: string;
};

export type RuleDraft = {
  regex: string;
  substitution: string;
};

type DynamicRule = Browser.declarativeNetRequest.Rule;

export async function verifyRegex(regex: string) {
  try {
    return await browser.declarativeNetRequest.isRegexSupported({
      regex,
      requireCapturing: true,
    });
  } catch (error) {
    return {
      isSupported: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function loadSavedRules(): Promise<SavedRule[]> {
  const rules = await browser.declarativeNetRequest.getDynamicRules();

  return rules
    .map((rule) => ({
      id: rule.id,
      priority: rule.priority ?? 0,
      regex: rule.condition?.regexFilter ?? '',
      substitution: rule.action?.redirect?.regexSubstitution ?? '',
    }))
    .filter((rule) => rule.regex !== '' && rule.substitution !== '')
    .sort((a, b) => b.priority - a.priority || a.id - b.id);
}

export function toDynamicRules(drafts: RuleDraft[]): DynamicRule[] {
  return drafts.map((draft, index) => ({
    id: index + 1,
    // 並び順が上のルールほど優先度を高くする。
    priority: drafts.length - index,
    condition: {
      regexFilter: draft.regex,
      resourceTypes: ['main_frame'],
    },
    action: {
      type: 'redirect',
      redirect: { regexSubstitution: draft.substitution },
    },
  }));
}
