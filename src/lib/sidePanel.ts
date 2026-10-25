export async function closeSidePanel(windowId?: number): Promise<void> {
  if (typeof chrome.sidePanel.close !== 'function') {
    throw new Error('Chrome 141 trở lên mới hỗ trợ đóng side panel bằng phím tắt.');
  }
  const targetWindowId = windowId ?? (await chrome.windows.getLastFocused()).id;
  if (targetWindowId === undefined) throw new Error('Không tìm thấy cửa sổ trình duyệt.');
  await chrome.sidePanel.close({ windowId: targetWindowId });
}
