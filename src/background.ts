import { addWord } from './lib/db';
import { syncToGithub } from './lib/github';
import { subscribeToSettings } from './lib/settings';

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
