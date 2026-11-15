import { browser } from 'wxt/browser';

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

type MessageKey = Exclude<
  Parameters<typeof browser.i18n.getMessage>[0],
  `@@${string}`
>;

function translate(key: string): string {
  const message = browser.i18n.getMessage(key as MessageKey);

  if (!message) {
    console.warn(`[i18n] Missing message: ${key}`);
  }

  return message;
}

function isHiddenText(node: Text): boolean {
  const parent = node.parentElement;
  return parent !== null && parent.closest('script, style') !== null;
}

function replaceInText(root: Node): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }

  for (const node of nodes) {
    if (!node.data.includes('{{') || isHiddenText(node)) {
      continue;
    }

    node.data = node.data.replace(PLACEHOLDER, (_, key: string) => translate(key));
  }
}

function replaceInAttributes(root: ParentNode): void {
  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    for (const attribute of element.attributes) {
      if (!attribute.value.includes('{{')) {
        continue;
      }

      attribute.value = attribute.value.replace(
        PLACEHOLDER,
        (_, key: string) => translate(key),
      );
    }
  }
}

/**
 * HTML の `{{key}}` を、現在のロケールの文言に置き換える。
 *
 * `<template>` の中身は別の DocumentFragment なので、再帰的に処理する。
 */
export function localize(root: ParentNode & Node = document): void {
  document.documentElement.lang = browser.i18n.getUILanguage();
  replaceInText(root);
  replaceInAttributes(root);

  for (const template of root.querySelectorAll('template')) {
    localize(template.content);
  }
}
