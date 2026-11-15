import { browser } from 'wxt/browser';

const ORIGINS = ['http://*/*', 'https://*/*'];

export async function hasHostAccess() {
  return browser.permissions.contains({ origins: ORIGINS });
}

export async function requestHostAccess() {
  return browser.permissions.request({ origins: ORIGINS });
}
