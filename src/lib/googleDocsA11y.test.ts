import { describe, expect, it } from 'vitest';
import { GoogleDocsSelectionTracker } from './googleDocsA11y';

describe('Google Docs screen-reader selection', () => {
  it('ignores Docs announcements unrelated to selection', () => {
    const tracker = new GoogleDocsSelectionTracker();
    const unrelated = document.createElement('div');
    unrelated.textContent = ' Bong bóng nút hành động nổi cùng dòng xuất hiện.';
    expect(tracker.accept(unrelated)).toBe(false);
    expect(tracker.text).toBe('');
  });

  it('reads a selection announced as one complete fragment', () => {
    const tracker = new GoogleDocsSelectionTracker();
    const announcements = document.createElement('div');
    const text = document.createElement('div');
    text.textContent = ' could you please help me add attach files?';
    const status = document.createElement('div');
    status.textContent = ' Selected';
    announcements.append(text, status);
    expect(tracker.accept(status)).toBe(true);
    expect(tracker.text).toBe('could you please help me add attach files?');
  });

  it('rebuilds the full Docs selection from incremental spoken fragments', () => {
    const tracker = new GoogleDocsSelectionTracker();
    const announcements = document.createElement('div');
    for (const fragment of [' c', ' o', ' u', ' ld you please help me add attac', ' h ', ' fil', ' es', ' dấu chấm hỏi', ' dòng mới']) {
      const text = document.createElement('div');
      text.textContent = fragment;
      const status = document.createElement('div');
      status.textContent = ' Đã chọn';
      announcements.append(text, status);
      tracker.accept(status);
    }
    expect(tracker.text).toBe('could you please help me add attach files?');
  });

  it('resets the previous selection when Docs announces deselection', () => {
    const tracker = new GoogleDocsSelectionTracker();
    const announcements = document.createElement('div');
    for (const [textValue, statusValue] of [[' hello', ' Đã chọn'], [' hello', ' Đã bỏ chọn'], [' world', ' Đã chọn']]) {
      const text = document.createElement('div');
      text.textContent = textValue;
      const status = document.createElement('div');
      status.textContent = statusValue;
      announcements.append(text, status);
      tracker.accept(status);
    }
    expect(tracker.text).toBe('world');
  });
});
