const SELECTED_MESSAGES = new Set(['đã chọn', 'selected']);
const CLEARED_MESSAGES = new Set(['đã bỏ chọn', 'bỏ chọn', 'deselected', 'unselected']);
const SPOKEN_SYMBOLS: Record<string, string> = {
  'dấu chấm hỏi': '?',
  'question mark': '?',
  'dấu chấm': '.',
  'period': '.',
  'dấu phẩy': ',',
  'comma': ',',
  'dấu hai chấm': ':',
  'colon': ':',
  'dấu chấm than': '!',
  'exclamation mark': '!',
  'dấu cách': ' ',
  'space': ' ',
  'dòng mới': '\n',
  'new line': '\n',
};

/** Docs announces newly selected fragments while dragging, not always the whole selection. */
export class GoogleDocsSelectionTracker {
  private value = '';

  reset(): void {
    this.value = '';
  }

  get text(): string {
    return this.value.trim();
  }

  accept(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const element = node as Element;
    const message = (element.textContent || '').trim().toLocaleLowerCase();
    if (CLEARED_MESSAGES.has(message)) {
      this.reset();
      return true;
    }
    if (!SELECTED_MESSAGES.has(message)) return false;

    // The first space belongs to Docs' screen-reader announcement. Any later
    // spaces are part of the selected text and must be preserved.
    const raw = (element.previousElementSibling?.textContent || '').replace(/^ /, '');
    const chunk = SPOKEN_SYMBOLS[raw.trim().toLocaleLowerCase()] ?? raw;
    if (chunk.startsWith(this.value) && this.value && chunk.length > this.value.length) {
      this.value = chunk;
    } else {
      this.value += chunk;
    }
    return true;
  }
}

