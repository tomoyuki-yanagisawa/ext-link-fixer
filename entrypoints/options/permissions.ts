import { browser } from 'wxt/browser';

export const ORIGINS = ['http://*/*', 'https://*/*'];

export async function hasHostAccess() {
  try {
    return await browser.permissions.contains({ origins: ORIGINS });
  } catch {
    return true;
  }
}

export async function requestHostAccess() {
  try {
    return await browser.permissions.request({ origins: ORIGINS });
  } catch {
    return false;
  }
}
