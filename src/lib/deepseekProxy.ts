import { getSettings, saveSettings, type Settings } from './settings';

export interface DeepSeekProxyHealth {
  online: boolean;
  url: string;
  latencyMs?: number;
  models?: string[];
  service?: string;
  error?: string;
}

/**
 * Kiểm tra xem người dùng có đang kích hoạt DeepSeek Local Proxy hay không
 */
export function isDeepSeekProxyActive(settings: Settings): boolean {
  return settings.ai_provider === 'deepseek' && settings.deepseek_auth_type === 'local_proxy';
}

/**
 * Gửi lệnh ping kiểm tra tình trạng hoạt động và độ trễ của Local DeepSeek Proxy (FreeDeepseekAPI)
 */
export async function pingDeepSeekProxy(customUrl?: string): Promise<DeepSeekProxyHealth> {
  const settings = await getSettings();
  const rawUrl = customUrl || settings.deepseek_proxy_url || 'http://127.0.0.1:9655';
  const cleanUrl = rawUrl.replace(/\/+$/, '');
  const rootEndpoint = `${cleanUrl}/`;

  const startTime = Date.now();

  // Thử qua Chrome Background service worker trước để tránh vấn đề CORS trong extension
  if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
    try {
      const reply = await new Promise<{ ok?: boolean; status?: number; latency?: number; data?: any; error?: string }>((resolve) => {
        chrome.runtime.sendMessage(
          { action: 'DEEPSEEK_PROXY_PING', payload: { url: rootEndpoint } },
          (resp) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(resp || { ok: false });
            }
          }
        );
      });

      if (reply && reply.ok) {
        return {
          online: true,
          url: cleanUrl,
          latencyMs: reply.latency || (Date.now() - startTime),
          models: Array.isArray(reply.data?.models) ? reply.data.models : ['deepseek-chat', 'deepseek-reasoner'],
          service: reply.data?.service || 'FreeDeepseekAPI'
        };
      }
    } catch {
      // Fallback xuống direct fetch
    }
  }

  // Fallback: Direct fetch (cho test và môi trường web)
  try {
    const res = await fetch(rootEndpoint, { method: 'GET', signal: AbortSignal.timeout(3000) });
    const latencyMs = Date.now() - startTime;
    if (res.ok) {
      let data: any = {};
      try { data = await res.json(); } catch {}
      return {
        online: true,
        url: cleanUrl,
        latencyMs,
        models: Array.isArray(data?.models) ? data.models : ['deepseek-chat', 'deepseek-reasoner'],
        service: data?.service || 'FreeDeepseekAPI'
      };
    }
    return {
      online: false,
      url: cleanUrl,
      error: `HTTP ${res.status}`
    };
  } catch (err: any) {
    return {
      online: false,
      url: cleanUrl,
      error: err?.message || 'Không thể kết nối đến proxy local'
    };
  }
}

/**
 * Bật hoặc tắt DeepSeek Local Proxy với một chạm
 */
export async function toggleDeepSeekProxy(enabled: boolean): Promise<Settings> {
  const current = await getSettings();
  if (enabled) {
    const prev = current.ai_provider !== 'deepseek' ? current.ai_provider : (current.previous_ai_provider || 'none');
    const updated: Partial<Settings> = {
      ai_provider: 'deepseek',
      deepseek_auth_type: 'local_proxy',
      deepseek_proxy_url: current.deepseek_proxy_url || 'http://127.0.0.1:9655',
      deepseek_model: current.deepseek_model || 'deepseek-chat',
      previous_ai_provider: prev
    };
    await saveSettings(updated);
    return { ...current, ...updated };
  } else {
    const fallbackProvider = current.previous_ai_provider && current.previous_ai_provider !== 'deepseek'
      ? current.previous_ai_provider
      : 'none';
    const updated: Partial<Settings> = {
      ai_provider: fallbackProvider
    };
    await saveSettings(updated);
    return { ...current, ...updated };
  }
}
