const BASE = 'http://127.0.0.1:39671';

export interface ChatGPTStatus {
  status: 'connected' | 'connecting' | 'disconnected';
  email?: string;
  name?: string;
  sharing: boolean;
  error?: string;
}

async function pairingCode(): Promise<string> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return window.localStorage.getItem('chatgpt_pairing_code') || '';
  }
  const data = await chrome.storage.local.get('chatgpt_pairing_code');
  if (typeof data.chatgpt_pairing_code === 'string' && data.chatgpt_pairing_code) return data.chatgpt_pairing_code;
  const reply = await chrome.runtime.sendMessage({ action: 'CHATGPT_COMPANION_START' });
  if (!reply?.pairingToken) throw new Error(reply?.error || 'Không khởi động được ChatGPT companion.');
  await chrome.storage.local.set({ chatgpt_pairing_code: reply.pairingToken });
  return reply.pairingToken;
}

export async function savePairingCode(code: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    window.localStorage.setItem('chatgpt_pairing_code', code.trim());
  } else {
    await chrome.storage.local.set({ chatgpt_pairing_code: code.trim() });
  }
}

export async function companionRequest<T>(path: '/status' | '/login' | '/logout' | '/models' | '/response' | '/antigravity/status' | '/antigravity/login' | '/antigravity/logout' | '/antigravity/models' | '/antigravity/response', body?: unknown): Promise<T> {
  const token = await pairingCode();
  if (!token) throw new Error('Hãy cài AI native host hoặc nhập mã ghép nối thủ công.');
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    throw new Error('Kết nối AI companion chỉ hoạt động trong extension Chrome.');
  }
  const reply = await chrome.runtime.sendMessage({ action: 'CHATGPT_COMPANION_REQUEST', path, body, token });
  if (reply?.error) throw new Error(reply.error);
  return reply as T;
}

export async function checkChatGPTConnection(): Promise<ChatGPTStatus> {
  return companionRequest<ChatGPTStatus>('/status');
}

export async function beginChatGPTLogin(newAccount = false): Promise<string> {
  return (await companionRequest<{ url: string }>('/login', { newAccount })).url;
}

export async function listChatGPTModels(): Promise<{ value: string; label: string }[]> {
  return (await companionRequest<{ models: { value: string; label: string }[] }>('/models')).models;
}

export async function chatGPTResponse(model: string, messages: { role: string; content: string }[]): Promise<string> {
  return (await companionRequest<{ text: string }>('/response', { model, messages })).text;
}

export { BASE as CHATGPT_COMPANION_URL };
