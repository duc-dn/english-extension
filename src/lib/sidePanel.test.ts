import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeSidePanel } from './sidePanel';

describe('closeSidePanel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('closes the requested browser window side panel only', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const getLastFocused = vi.fn();
    vi.stubGlobal('chrome', { sidePanel: { close }, windows: { getLastFocused } });

    await closeSidePanel(42);

    expect(close).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledWith({ windowId: 42 });
    expect(getLastFocused).not.toHaveBeenCalled();
  });

  it('uses the focused window when the side panel sends the shortcut', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      sidePanel: { close },
      windows: { getLastFocused: vi.fn().mockResolvedValue({ id: 17 }) },
    });

    await closeSidePanel();

    expect(close).toHaveBeenCalledWith({ windowId: 17 });
  });
});
