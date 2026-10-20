import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasRuntimeError, isExtensionContextValid } from './extensionContext';

afterEach(() => vi.unstubAllGlobals());

describe('extension context after reload', () => {
  it('treats a missing Chrome runtime as invalid', () => {
    vi.stubGlobal('chrome', undefined);
    expect(isExtensionContextValid()).toBe(false);
    expect(hasRuntimeError()).toBe(true);
  });

  it('handles getManifest throwing after extension reload', () => {
    vi.stubGlobal('chrome', {
      runtime: { id: 'old-extension', getManifest: () => { throw new Error('Extension context invalidated.'); } },
    });
    expect(isExtensionContextValid()).toBe(false);
    expect(hasRuntimeError()).toBe(true);
  });

  it('handles lastError throwing in a delayed callback', () => {
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'extension',
        getManifest: () => ({}),
        get lastError() { throw new Error('Extension context invalidated.'); },
      },
    });
    expect(isExtensionContextValid()).toBe(true);
    expect(hasRuntimeError()).toBe(true);
  });
});
