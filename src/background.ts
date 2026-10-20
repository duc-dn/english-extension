import { addWord, getLearningWords, markWordMastered } from './lib/db';
import { syncToGithub } from './lib/github';
import { subscribeToSettings } from './lib/settings';
import { polishWritingWithAI } from './lib/translator';
import { checkAndNotifyPendingTodos, updateChromeExtensionBadge } from './lib/todo';

function setupTodoAlarms(intervalMinutes: number = 15) {
  if (typeof chrome !== 'undefined' && chrome.alarms) {
    chrome.alarms.create('check_todo_reminders', {
      periodInMinutes: Math.max(1, intervalMinutes),
    });
  }
}

function setupGithubAutoSyncAlarm(enabled: boolean = false, intervalHours: number = 12) {
  if (typeof chrome !== 'undefined' && chrome.alarms) {
    if (enabled) {
      chrome.alarms.create('github_auto_sync', {
        periodInMinutes: Math.max(60, intervalHours * 60),
      });
    } else {
      chrome.alarms.clear('github_auto_sync');
    }
  }
}

if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'check_todo_reminders') {
      checkAndNotifyPendingTodos().catch((err) => console.error('Todo reminder alarm failed:', err));
    }
    if (alarm.name === 'github_auto_sync') {
      syncToGithub()
        .then(() => console.log('Periodic GitHub auto-sync succeeded.'))
        .catch((err) => console.warn('Periodic GitHub auto-sync failed:', err));
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.notifications) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId.startsWith('todo-reminder-')) {
      const url = chrome.runtime.getURL('index.html#/todos');
      chrome.tabs.create({ url }).catch(() => {});
    }
  });
}

async function startChatGPTCompanion(): Promise<{ pairingToken: string }> {
  let reply: { ok?: boolean; pairingToken?: string; error?: string };
  try {
    reply = await chrome.runtime.sendNativeMessage('com.english_extension.chatgpt', { action: 'start' });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Không gọi được ChatGPT native host: ${detail}. Nếu host chưa được cài, chạy npm run chatgpt:install-host -- ${chrome.runtime.id}`);
  }
  if (!reply?.ok || !reply.pairingToken) throw new Error(reply?.error || 'Không khởi động được ChatGPT companion.');
  await chrome.storage.local.set({ chatgpt_pairing_code: reply.pairingToken });
  return { pairingToken: reply.pairingToken };
}

async function requestChatGPTCompanion(request: { path: string; body?: unknown; token: string }) {
  const paths = ['/status', '/login', '/logout', '/models', '/response'];
  if (!paths.includes(request.path) || typeof request.token !== 'string' || request.token.length < 20) {
    throw new Error('Yêu cầu ChatGPT không hợp lệ.');
  }
  const method = ['/login', '/logout', '/response'].includes(request.path) ? 'POST' : 'GET';
  const run = (token: string) => fetch(`http://127.0.0.1:39671${request.path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(request.body || {}) } : {}),
      signal: AbortSignal.timeout(request.path === '/response' ? 130000 : 30000),
    });
  let response: Response;
  try { response = await run(request.token); }
  catch {
    const started = await startChatGPTCompanion();
    response = await run(started.pairingToken);
  }
  if (response.status === 401) {
    const started = await startChatGPTCompanion();
    response = await run(started.pairingToken);
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Companion HTTP ${response.status}`);
  return result;
}

async function setupProxyHeaderRules() {
  if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest) {
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [9655],
        addRules: [
          {
            id: 9655,
            priority: 1,
            action: {
              type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
              requestHeaders: [
                { header: 'origin', operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
                { header: 'referer', operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE }
              ]
            },
            condition: {
              urlFilter: ':9655/',
              resourceTypes: [
                chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
                chrome.declarativeNetRequest.ResourceType.OTHER
              ]
            }
          }
        ]
      });
    } catch (e) {
      console.warn('Could not register declarativeNetRequest rule:', e);
    }
  }
}

if (typeof chrome !== 'undefined') {
  setupProxyHeaderRules();
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
  setupProxyHeaderRules();
  setupTodoAlarms();
  updateChromeExtensionBadge().catch(() => {});
  chrome.contextMenus.create({
    id: 'open-sidepanel-selection',
    title: 'Dịch với English Extension',
    contexts: ['selection']
  });
});

chrome.runtime.onStartup.addListener(() => {
  setupTodoAlarms();
  updateChromeExtensionBadge().catch(() => {});
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

const chatSelectionRevisionByTab = new Map<number, number>();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PASTE_AI_INTO_GOOGLE_DOCS') {
    const tabId = request.tabId;
    (async () => {
      if (!Number.isInteger(tabId)) throw new Error('Invalid Google Docs tab');
      const tab = await chrome.tabs.get(tabId);
      if (!/^https:\/\/docs\.google\.com\/document\//.test(tab.url || '')) throw new Error('The active tab is not Google Docs');
      const target = { tabId };
      let attached = false;
      try {
        const before = await chrome.tabs.sendMessage(tabId, { action: 'GET_GOOGLE_DOCS_PASTE_TIME' })
          .catch(() => null) as { lastPasteAt?: number } | null;
        await chrome.debugger.attach(target, '1.3');
        attached = true;
        // Side panel clicks can steal focus from the Docs editing iframe.
        // Restore it in the tab's main world immediately before sending input.
        const focus = await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
          expression: `(() => {
            const frame = document.querySelector('.docs-texteventtarget-iframe');
            const doc = frame?.contentDocument;
            const editor = doc?.querySelector('[contenteditable="true"]') || doc?.body;
            frame?.contentWindow?.focus();
            editor?.focus();
            return !!editor && doc.activeElement === editor;
          })()`,
          returnByValue: true,
        }) as { result?: { value?: boolean }; exceptionDetails?: unknown };
        if (focus.exceptionDetails || !focus.result?.value) throw new Error('Google Docs editor did not receive focus');
        const isMac = request.isMac === true;
        const modifier = isMac ? 4 : 2;
        await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
          type: 'rawKeyDown', key: 'v', code: 'KeyV',
          windowsVirtualKeyCode: 86, nativeVirtualKeyCode: isMac ? 9 : 86,
          modifiers: modifier, unmodifiedText: 'v', commands: ['Paste'],
        });
        await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
          type: 'keyUp', key: 'v', code: 'KeyV',
          windowsVirtualKeyCode: 86, nativeVirtualKeyCode: isMac ? 9 : 86,
          modifiers: modifier,
        });
        await new Promise(resolve => setTimeout(resolve, 500));
        const after = await chrome.tabs.sendMessage(tabId, { action: 'GET_GOOGLE_DOCS_PASTE_TIME' })
          .catch(() => null) as { lastPasteAt?: number } | null;
        if ((after?.lastPasteAt || 0) > (before?.lastPasteAt || 0)) {
          return { success: true, confirmed: true };
        }
        // Google Docs can consume the edit command without forwarding a paste
        // event to the content script. Do not convert to plain text or claim
        // failure solely because that observer did not fire.
        return { success: true, confirmed: false };
      } finally {
        if (attached) await chrome.debugger.detach(target);
      }
    })().then(sendResponse).catch(error => sendResponse({ success: false, error: String(error) }));
    return true;
  }

  if (request.action === 'SET_CHAT_SELECTION') {
    const text = typeof request.text === 'string' ? request.text.trim() : '';
    const tabId = sender.tab?.id;
    if (tabId && text.length <= 12000) {
      const revision = (chatSelectionRevisionByTab.get(tabId) || 0) + 1;
      chatSelectionRevisionByTab.set(tabId, revision);
      if (text) {
        chrome.storage.session.set({ chatSelection: { text, tabId, url: sender.tab?.url || '', title: sender.tab?.title || '' } });
      } else {
        chrome.storage.session.get('chatSelection').then(({ chatSelection }) => {
          const current = chatSelection as { tabId?: number; url?: string } | undefined;
          if (chatSelectionRevisionByTab.get(tabId) === revision &&
              (current?.tabId === tabId || (!current?.tabId && current?.url === sender.tab?.url))) {
            return chrome.storage.session.remove('chatSelection');
          }
        }).catch(() => {});
      }
    }
    return;
  }

  if (request.action === 'CHATGPT_COMPANION_START') {
    startChatGPTCompanion()
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message || 'Không khởi động được ChatGPT companion.' }));
    return true;
  }

  if (request.action === 'CHATGPT_COMPANION_REQUEST') {
    requestChatGPTCompanion(request)
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message || 'Không thể kết nối ChatGPT.' }));
    return true;
  }

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
    const { word, meaning, phonetic, example, contextSentence, sourceUrl, sourceTitle } = request.payload;
    
    // Save to IndexedDB
    addWord({
      word: word,
      phonetic: phonetic || '',
      meaning: meaning || 'Chưa dịch được',
      example: example || '',
      contextSentence: contextSentence || example || '',
      sourceUrl: sourceUrl || '',
      sourceTitle: sourceTitle || '',
      tags: ['web-clipping']
    }).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('Error saving word from content script:', error);
      sendResponse({ success: false, error: error.message });
    });

    return true;
  }

  if (request.action === 'DEEPSEEK_PROXY_FETCH') {
    const { endpoint, headers, reqBody } = request.payload;
    fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(reqBody)
    })
      .then(async (res) => {
        const text = await res.text();
        sendResponse({ ok: res.ok, status: res.status, text });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  if (request.action === 'DEEPSEEK_PROXY_PING') {
    const url = request.payload?.url || 'http://127.0.0.1:9655/';
    const start = Date.now();
    fetch(url, { method: 'GET', signal: AbortSignal.timeout(3000) })
      .then(async (res) => {
        const latency = Date.now() - start;
        let data = null;
        try { data = await res.json(); } catch {}
        sendResponse({ ok: res.ok, status: res.status, latency, data });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
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

  if (request.action === 'GET_LEARNING_WORDS') {
    getLearningWords()
      .then((words) => sendResponse({ ok: true, words }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (request.action === 'MARK_WORD_MASTERED') {
    markWordMastered(request.payload.id)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (request.action === 'POLISH_WRITING') {
    const { text, tone, customInstruction } = request.payload;
    polishWritingWithAI(text, tone, customInstruction)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (request.action === 'REFRESH_TODO_BADGE') {
    updateChromeExtensionBadge()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (request.action === 'CHECK_TODO_REMINDERS') {
    checkAndNotifyPendingTodos()
      .then((res) => sendResponse({ ok: true, ...res }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

// Subscribe to settings and update the Chrome uninstall URL to the user's GitHub backup repository
subscribeToSettings((settings) => {
  if (settings.todo_reminder_interval) {
    setupTodoAlarms(settings.todo_reminder_interval);
  }
  updateChromeExtensionBadge().catch(() => {});

  if (settings.enable_auto_github_sync && settings.github_repo && settings.github_token) {
    setupGithubAutoSyncAlarm(true, settings.auto_github_sync_interval_hours || 12);
  } else {
    setupGithubAutoSyncAlarm(false);
  }

  if (settings.github_repo) {
    const cleanRepo = settings.github_repo.replace('https://github.com/', '').replace(/^\/+|\/+$/g, '');
    const uninstallUrl = `https://github.com/${cleanRepo}`;
    chrome.runtime.setUninstallURL(uninstallUrl);
  } else {
    chrome.runtime.setUninstallURL('');
  }
});
