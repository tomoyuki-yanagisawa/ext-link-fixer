import { describe, expect, it, vi } from 'vitest';
import background from '../entrypoints/background';

const { addListener, openOptionsPage } = vi.hoisted(() => ({
  addListener: vi.fn<(listener: () => void) => void>(),
  openOptionsPage: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    action: { onClicked: { addListener } },
    runtime: { openOptionsPage },
  },
}));

describe('background', () => {
  it('opens the options page when the action is clicked', () => {
    background.main();

    expect(addListener).toHaveBeenCalledOnce();

    const listener = addListener.mock.lastCall?.[0];
    expect(listener).toBeDefined();
    listener?.();

    expect(openOptionsPage).toHaveBeenCalledOnce();
  });
});
