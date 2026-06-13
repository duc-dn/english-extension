import { addWord } from './lib/db';
import { syncToGithub } from './lib/github';
import { subscribeToSettings } from './lib/settings';

if (typeof chrome !== 'undefined') {
  // Set global side panel default path
  if (chrome.sidePanel) {
    chrome.sidePanel.setOptions({
      path: 'index.html?mode=sidepanel',
      enabled: true
    }).catch(err => console.error("Failed to set global sidePanel options:", err));
  }
  // Set global default popup path
  if (chrome.action) {
    chrome.action.setPopup({ popup: 'index.html?mode=popup' })
      .catch(err => console.error("Failed to set global action popup:", err));
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'open-sidepanel-selection',
    title: 'Dịch với English Extension',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-sidepanel-selection' && info.selectionText) {
    if (tab && tab.id) {
      chrome.sidePanel.open({ tabId: tab.id })
        .then(() => {
          chrome.storage.local.set({ selectedParagraph: info.selectionText });
        })
        .catch((err) => {
          console.error("Failed to open side panel via context menu:", err);
        });
    }
  }
});

// Keyboard shortcut to open side panel
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'open_side_panel') {
    if (tab && tab.id) {
      chrome.sidePanel.open({ tabId: tab.id })
        .catch((err) => {
          console.error("Failed to open side panel via keyboard shortcut:", err);
        });
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'SYNC_GITHUB') {
    syncToGithub()
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.error('Auto-sync to GitHub failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'SAVE_WORD') {
    const { word, meaning, phonetic, example } = request.payload;
    
    // Save to IndexedDB
    addWord({
      word: word,
      phonetic: phonetic || '',
      meaning: meaning || 'Chưa dịch được',
      example: example || '',
      tags: ['web-clipping']
    }).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('Error saving word from content script:', error);
      sendResponse({ success: false, error: error.message });
    });

    return true;
  }

  if (request.action === 'OPEN_SIDEPANEL') {
    if (sender.tab && sender.tab.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .then(() => {
          chrome.storage.local.set({ selectedParagraph: request.payload.text });
        })
        .catch((err) => {
          console.error("Failed to open side panel:", err);
        });
      sendResponse({ success: true });
    }
    return true;
  }
});

// Subscribe to settings and update the Chrome uninstall URL to the user's GitHub backup repository
subscribeToSettings((settings) => {
  if (settings.github_repo) {
    const cleanRepo = settings.github_repo.replace('https://github.com/', '').replace(/^\/+|\/+$/g, '');
    const uninstallUrl = `https://github.com/${cleanRepo}`;
    chrome.runtime.setUninstallURL(uninstallUrl);
  } else {
    chrome.runtime.setUninstallURL('');
  }
});
