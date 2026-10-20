export function isExtensionContextValid(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id && !!chrome.runtime.getManifest();
  } catch {
    return false;
  }
}

export function hasRuntimeError(): boolean {
  try {
    return !isExtensionContextValid() || !!chrome.runtime.lastError;
  } catch {
    return true;
  }
}
