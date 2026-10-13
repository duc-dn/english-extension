import { getSettings, type Settings } from './settings';
import { message } from 'antd';
import { chatGPTResponse } from './chatgptCompanion';

export interface TranslationResult {
  word: string;
  phonetic?: string;
  vietnameseMeaning?: string;
  meanings: {
    partOfSpeech: string;
    definitions: {
      definition: string;
      example?: string;
    }[];
  }[];
}

export interface AITestResult {
  success: boolean;
  message: string;
  model?: string;
  latencyMs?: number;
  sampleResponse?: string;
}

/**
 * Lớp 1: Phân tích và tra cứu chi tiết từ vựng bằng AI (không gọi API public)
 */
export async function fetchWordWithAI(word: string, customSettings?: Partial<Settings>): Promise<TranslationResult | null> {
  const currentSettings = await getSettings();
  const settings = { ...currentSettings, ...customSettings };
  if (!settings.ai_provider || settings.ai_provider === 'none') {
    return null;
  }

  const prompt = `Phân tích từ vựng tiếng Anh sau: "${word}".
Hãy trả về DUY NHẤT một đối tượng JSON hợp lệ theo cấu trúc sau (không có markdown code block \`\`\`json hay bất kỳ văn bản thừa nào):
{
  "word": "${word}",
  "phonetic": "/phiên âm IPA/",
  "vietnameseMeaning": "nghĩa tiếng Việt ngắn gọn, thông dụng nhất",
  "meanings": [
    {
      "partOfSpeech": "loại từ (noun/verb/adjective/adverb...)",
      "definitions": [
        {
          "definition": "định nghĩa ngắn gọn bằng tiếng Anh",
          "example": "ví dụ câu tiếng Anh"
        }
      ]
    }
  ]
}`;

  try {
    const rawResponse = await callAI([{ role: 'user', content: prompt }], true, settings);
    const cleaned = rawResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (parsed && (parsed.vietnameseMeaning || (parsed.meanings && parsed.meanings.length > 0))) {
      return {
        word: parsed.word || word,
        phonetic: parsed.phonetic || '',
        vietnameseMeaning: parsed.vietnameseMeaning || '',
        meanings: Array.isArray(parsed.meanings) ? parsed.meanings : []
      };
    }
  } catch (err) {
    console.error('fetchWordWithAI failed, will fallback to public API:', err);
  }
  return null;
}

/**
 * Dịch văn bản / từ miễn phí qua Google Translate Public Endpoint (Không cần API key)
 */
export async function translateWithGoogleFree(text: string): Promise<string | null> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = data[0]
          .map((item: any) => (item && item[0] ? item[0] : ''))
          .join('');
        if (translated.trim()) {
          return translated.trim();
        }
      }
    }
  } catch (err) {
    console.error("Google Translate Free failed:", err);
  }
  return null;
}

/**
 * Lớp 2: Basic Translation using Free Dictionary API + Google Translate / MyMemory API (English to Vietnamese)
 * API public miễn phí khi không sử dụng AI hoặc AI gặp sự cố.
 */
export async function fetchPublicDictionary(word: string): Promise<TranslationResult | null> {
  try {
    // 1. Fetch English details (part of speech, examples)
    const dictResponse = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    
    let result: Partial<TranslationResult> = { word };

    if (dictResponse.ok) {
      const dictData = await dictResponse.json();
      if (dictData && dictData.length > 0) {
        result = { ...dictData[0] };
      }
    }

    // 2. Fetch Vietnamese translation: Google Translate Free -> MyMemory Fallback
    let vietnameseMeaning = await translateWithGoogleFree(word);
    if (!vietnameseMeaning) {
      try {
        const viResponse = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|vi`);
        if (viResponse.ok) {
          const viData = await viResponse.json();
          if (viData && viData.responseData && viData.responseData.translatedText) {
            vietnameseMeaning = viData.responseData.translatedText;
          }
        }
      } catch (err) {
        console.error("MyMemory translation failed:", err);
      }
    }

    if (vietnameseMeaning) {
      result.vietnameseMeaning = vietnameseMeaning;
    }

    if (!result.meanings && !result.vietnameseMeaning) {
      return null;
    }

    return result as TranslationResult;
  } catch (error) {
    console.error("Error fetching dictionary APIs:", error);
    return null;
  }
}

/**
 * Hàm tra cứu chính: Nếu đã bật AI thì dùng AI, nếu chưa hoặc lỗi thì dùng Public Dictionary
 */
export async function fetchBasicMeaning(word: string): Promise<TranslationResult | null> {
  const settings = await getSettings();
  
  // 1. Nếu đã bật AI, tra cứu trực tiếp qua AI (KHÔNG gọi API public dictionary)
  if (settings.ai_provider && settings.ai_provider !== 'none') {
    const aiResult = await fetchWordWithAI(word, settings);
    if (aiResult) {
      return aiResult;
    }
    console.warn('AI word lookup failed or returned empty, falling back to public APIs...');
  }

  // 2. Fallback sang Free Dictionary API + Google Translate / MyMemory
  return await fetchPublicDictionary(word);
}

async function runFallbackTranslation(text: string): Promise<string> {
  // 1. Ưu tiên Google Translate Free
  const googleRes = await translateWithGoogleFree(text);
  if (googleRes) {
    return googleRes;
  }

  // 2. Fallback sang MyMemory
  try {
    const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|vi`);
    if (response.ok) {
      const data = await response.json();
      return data.responseData?.translatedText || 'Không thể dịch đoạn văn này.';
    }
  } catch (err) {
    console.error("MyMemory translation failed:", err);
  }
  return 'Lỗi kết nối khi dịch đoạn văn.';
}

function runFallbackSummary(text: string): string {
  const sentences = text.split(/[.!?]+/);
  const validSentences = sentences.filter(s => s.trim().length > 5);
  if (validSentences.length > 1) {
    return `Tóm tắt (Trích dẫn): "${validSentences[0].trim()}..."`;
  }
  return `Đoạn văn quá ngắn hoặc không thể phân tích tóm tắt.`;
}

async function callChatGPTAI(messages: { role: string; content: string }[], model?: string): Promise<string> {
  return chatGPTResponse(model || 'gpt-6.1-sol', messages);
}

async function callDeepSeekWebChat(
  token: string,
  messages: { role: string; content: string }[],
  isReasoner = false
): Promise<string> {
  const cleanToken = token.trim().replace(/^Bearer\s+/i, '');
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cleanToken}`,
    'Accept': 'text/event-stream, application/json'
  };

  // 1. Tạo session chat mới hoặc lấy session
  let sessionId = '';
  try {
    const sessionRes = await fetch('https://chat.deepseek.com/api/v0/chat_session/create', {
      method: 'POST',
      headers,
      body: JSON.stringify({ character_id: null })
    });
    if (sessionRes.ok) {
      const sessionData = await sessionRes.json();
      sessionId = sessionData.data?.biz_data?.id || sessionData.data?.id || sessionData.id || '';
    } else {
      const err = await sessionRes.text();
      let msg = `Tạo phiên DeepSeek Chat thất bại (${sessionRes.status})`;
      try {
        const parsed = JSON.parse(err);
        msg = parsed.msg || parsed.message || msg;
      } catch (e) {}
      throw new Error(msg);
    }
  } catch (err: any) {
    throw new Error(err.message || 'Lỗi kết nối phiên DeepSeek Web');
  }

  if (!sessionId) {
    throw new Error('Không thể khởi tạo chat_session_id từ DeepSeek Web.');
  }

  // Kết hợp tin nhắn thành prompt
  const prompt = messages.map(m => {
    if (m.role === 'system') return `[Yêu cầu hệ thống: ${m.content}]`;
    return m.content;
  }).join('\n\n');

  // 2. Gửi request chat completion với chat_session_id
  const compRes = await fetch('https://chat.deepseek.com/api/v0/chat/completion', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      chat_session_id: sessionId,
      parent_message_id: null,
      prompt: prompt,
      ref_file_ids: [],
      thinking_enabled: isReasoner,
      search_enabled: false
    })
  });

  if (!compRes.ok) {
    const errText = await compRes.text();
    let msg = `DeepSeek Web API error (${compRes.status})`;
    try {
      const parsed = JSON.parse(errText);
      msg = parsed.msg || parsed.message || parsed.error || msg;
    } catch (e) {}
    throw new Error(msg);
  }

  const rawText = await compRes.text();

  // 3. Xử lý phản hồi (hỗ trợ cả dạng SSE text/event-stream và JSON)
  let accumulatedText = '';
  let serverErrorMsg = '';
  const lines = rawText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'data: [DONE]' || trimmed === 'data:[DONE]') continue;
    if (trimmed.startsWith('data:')) {
      const jsonPart = trimmed.replace(/^data:\s*/, '').trim();
      try {
        const parsed = JSON.parse(jsonPart);
        if (parsed.code && parsed.code !== 0 && parsed.msg) {
          serverErrorMsg = parsed.msg;
        }
        if (parsed.error && typeof parsed.error === 'string') {
          serverErrorMsg = parsed.error;
        }

        const delta = parsed.choices?.[0]?.delta?.content 
          || parsed.choices?.[0]?.delta?.text
          || parsed.choices?.[0]?.text
          || parsed.choices?.[0]?.message?.content
          || parsed.data?.biz_data?.choices?.[0]?.delta?.content
          || parsed.data?.biz_data?.choices?.[0]?.delta?.text
          || parsed.data?.response
          || parsed.response
          || parsed.text
          || parsed.content
          || parsed.v
          || '';
        if (delta) {
          accumulatedText += delta;
        }
      } catch (e) {
        // Bỏ qua nếu dòng data không phải JSON
      }
    }
  }

  if (!accumulatedText.trim()) {
    try {
      const json = JSON.parse(rawText);
      if (json.code && json.code !== 0 && json.msg) {
        serverErrorMsg = json.msg;
      }
      accumulatedText = json.choices?.[0]?.message?.content 
        || json.choices?.[0]?.delta?.content
        || json.data?.biz_data?.choices?.[0]?.message?.content
        || json.data?.response 
        || json.response 
        || json.text
        || '';
    } catch (e) {}
  }

  if (serverErrorMsg) {
    throw new Error(`DeepSeek Web: ${serverErrorMsg}`);
  }

  if (!accumulatedText.trim()) {
    // Nếu rawText có nội dung nhưng không trích xuất được
    if (rawText.trim().length > 0 && rawText.length < 300) {
      throw new Error(`DeepSeek Web trả về: ${rawText.trim()}`);
    }
    throw new Error('DeepSeek Web yêu cầu xác thực PoW Challenge (Cloudflare/Anti-bot) hoặc phiên token đã hết hạn. Hãy đăng nhập lại trên chat.deepseek.com hoặc sử dụng API Key.');
  }

  return accumulatedText.trim();
}

async function callAI(
  messages: { role: string; content: string }[], 
  isJson = false,
  overrideSettings?: Partial<Settings>
): Promise<string> {
  const currentSettings = await getSettings();
  const settings = { ...currentSettings, ...overrideSettings };
  const provider = settings.ai_provider;

  if (provider === 'gemini') {
    if (!settings.gemini_api_key) {
      throw new Error('Gemini API Key is not configured.');
    }
    const primaryModel = settings.gemini_model || 'gemini-2.5-flash-lite';
    const candidateModels = [
      primaryModel,
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
      'gemini-1.5-flash'
    ].filter((m, i, arr) => arr.indexOf(m) === i);
    
    const systemMessage = messages.find(m => m.role === 'system');
    const userAndModelMessages = messages.filter(m => m.role !== 'system');
    const formattedContents = userAndModelMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [{ text: m.content }]
    }));

    const reqBody: any = {
      contents: formattedContents
    };
    if (systemMessage) {
      reqBody.systemInstruction = {
        parts: [{ text: systemMessage.content }]
      };
    }

    if (isJson) {
      reqBody.generationConfig = {
        responseMimeType: 'application/json'
      };
    }

    let lastError: any = null;
    for (const model of candidateModels) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.gemini_api_key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody)
        });

        if (response.ok) {
          const data = await response.json();
          return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }

        const errText = await response.text();
        let msg = `Gemini API error (Status ${response.status})`;
        try {
          const parsed = JSON.parse(errText);
          msg = parsed.error?.message || msg;
        } catch (e) {}

        // If 429 rate limit or quota exceeded, try next fallback model
        if (response.status === 429 || response.status === 503 || msg.includes('Quota') || msg.includes('ResourceExhausted')) {
          console.warn(`Gemini model ${model} reached quota limit (${response.status}), trying next candidate model...`);
          lastError = new Error(msg);
          continue;
        }

        throw new Error(msg);
      } catch (err: any) {
        lastError = err;
        if (err.message && (err.message.includes('429') || err.message.includes('Quota') || err.message.includes('ResourceExhausted'))) {
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('All Gemini models exhausted.');
  }

  if (provider === 'deepseek') {
    const authType = settings.deepseek_auth_type || (settings.deepseek_api_key ? 'api_key' : 'local_proxy');

    // 1. Dùng DeepSeek Local Proxy (FreeDeepseekAPI - Local Server)
    if (authType === 'local_proxy') {
      const baseUrl = (settings.deepseek_proxy_url || 'http://127.0.0.1:9655').replace(/\/+$/, '');
      const endpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
      
      const reqBody: any = {
        model: settings.deepseek_model || 'deepseek-chat',
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        stream: false
      };
      if (isJson) {
        reqBody.response_format = { type: 'json_object' };
      }

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-agent-session': 'english-extension'
        };
        if (settings.deepseek_api_key) {
          headers['Authorization'] = `Bearer ${settings.deepseek_api_key}`;
        } else {
          headers['Authorization'] = 'Bearer local-proxy-key';
        }

        let rawText = '';
        let isOk = false;
        let statusCode = 200;

        // Ưu tiên gửi qua background service worker để loại bỏ hoàn toàn Origin header
        if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
          try {
            const reply = await new Promise<{ ok?: boolean; status?: number; text?: string; error?: string }>((resolve) => {
              chrome.runtime.sendMessage(
                { action: 'DEEPSEEK_PROXY_FETCH', payload: { endpoint, headers, reqBody } },
                (resp) => {
                  if (chrome.runtime.lastError) {
                    resolve({ ok: false, error: chrome.runtime.lastError.message });
                  } else {
                    resolve(resp || { ok: false });
                  }
                }
              );
            });
            if (reply && reply.text !== undefined) {
              isOk = !!reply.ok;
              statusCode = reply.status || 200;
              rawText = reply.text;
            }
          } catch (e) {
            // Fallback sang fetch trực tiếp
          }
        }

        // Nếu chưa có kết quả (môi trường test hoặc local), fetch trực tiếp
        if (!rawText) {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(reqBody)
          });
          isOk = response.ok;
          statusCode = response.status;
          if (typeof response.text === 'function') {
            rawText = await response.text();
          } else if (typeof response.json === 'function') {
            const j = await response.json();
            rawText = JSON.stringify(j);
          }
        }

        if (isOk) {
          const data = JSON.parse(rawText);
          return data.choices?.[0]?.message?.content || data.choices?.[0]?.delta?.content || '';
        } else {
          let msg = `Local Proxy error (${statusCode})`;
          try {
            const parsed = JSON.parse(rawText);
            msg = parsed.error?.message || parsed.msg || msg;
          } catch (e) {}
          throw new Error(msg);
        }
      } catch (err: any) {
        if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('ECONNREFUSED'))) {
          throw new Error(`Không thể kết nối đến FreeDeepseekAPI tại ${baseUrl}. Hãy chắc chắn bạn đã chạy "npm start" trong thư mục FreeDeepseekAPI.`);
        }
        throw err;
      }
    }

    // 2. Dùng DeepSeek Web Token (chat.deepseek.com)
    if (authType === 'web_token') {
      if (!settings.deepseek_web_token) {
        throw new Error('DeepSeek Web Token is not configured.');
      }
      return callDeepSeekWebChat(
        settings.deepseek_web_token,
        messages,
        settings.deepseek_model === 'deepseek-reasoner'
      );
    }

    // 3. Dùng DeepSeek Official API Key (api.deepseek.com)
    if (!settings.deepseek_api_key) {
      throw new Error('DeepSeek API Key is not configured.');
    }

    const reqBody: any = {
      model: settings.deepseek_model || 'deepseek-chat',
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    };
    if (isJson) {
      reqBody.response_format = { type: 'json_object' };
    }

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.deepseek_api_key}`
      },
      body: JSON.stringify(reqBody)
    });

    if (response.ok) {
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } else {
      const errText = await response.text();
      let msg = `DeepSeek API error (Status ${response.status})`;
      try {
        const parsed = JSON.parse(errText);
        msg = parsed.error?.message || msg;
      } catch (e) {}
      throw new Error(msg);
    }
  }

  if (provider === 'openai') {
    const authType = settings.openai_auth_type || (settings.openai_api_key ? 'api_key' : 'chatgpt_web');
    if (authType === 'chatgpt_web') {
      return callChatGPTAI(messages, settings.chatgpt_model);
    }

    if (!settings.openai_api_key) {
      throw new Error('OpenAI API Key is not configured.');
    }
    const reqBody: any = {
      model: settings.openai_model || 'gpt-4o-mini',
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    };
    if (isJson) {
      reqBody.response_format = { type: 'json_object' };
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.openai_api_key}`
      },
      body: JSON.stringify(reqBody)
    });

    if (response.ok) {
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } else {
      const errText = await response.text();
      let msg = `OpenAI API error (Status ${response.status})`;
      try {
        const parsed = JSON.parse(errText);
        msg = parsed.error?.message || msg;
      } catch (e) {}
      throw new Error(msg);
    }
  }

  if (provider === 'chatgpt_web') {
    return callChatGPTAI(messages, settings.chatgpt_model);
  }

  if (provider === 'ollama') {
    const url = settings.ollama_url || 'http://localhost:11434';
    
    // 1. Try to fetch the list of installed models, default to llama3 if unavailable
    let model = 'llama3';
    try {
      const tagsResponse = await fetch(`${url}/api/tags`);
      if (tagsResponse.ok) {
        const tagsData = await tagsResponse.json();
        if (tagsData && tagsData.models && tagsData.models.length > 0) {
          model = tagsData.models[0].name;
        }
      }
    } catch (e) {
      console.warn("Failed to auto-detect Ollama model, defaulting to llama3:", e);
    }

    const reqBody: any = {
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      stream: false
    };
    if (isJson) {
      reqBody.format = 'json';
    }

    const response = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });

    if (response.ok) {
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } else {
      // Fallback to /api/chat if /v1/chat/completions is not supported by older Ollama version
      const legacyResponse = await fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content
          })),
          stream: false
        })
      });
      if (legacyResponse.ok) {
        const data = await legacyResponse.json();
        return data.message?.content || '';
      }
      
      const errText = await legacyResponse.text();
      throw new Error(`Ollama API error: ${errText || legacyResponse.statusText}`);
    }
  }

  throw new Error('No AI provider configured.');
}

function getMissingConfigMessage(settings: any, featureName: string): string | null {
  const provider = settings.ai_provider;
  if (provider === 'none' || provider === 'gemini') {
    if (!settings.gemini_api_key) {
      return `Vui lòng cấu hình Gemini API Key để sử dụng tính năng ${featureName}.`;
    }
  }
  if (provider === 'deepseek') {
    const authType = settings.deepseek_auth_type || (settings.deepseek_api_key ? 'api_key' : 'local_proxy');
    if (authType === 'api_key' && !settings.deepseek_api_key) {
      return `Vui lòng cấu hình DeepSeek API Key để sử dụng tính năng ${featureName}.`;
    }
    if (authType === 'web_token' && !settings.deepseek_web_token) {
      return `Vui lòng cấu hình DeepSeek Web Token để sử dụng tính năng ${featureName}.`;
    }
    if (authType === 'local_proxy' && !settings.deepseek_proxy_url) {
      return `Vui lòng cấu hình DeepSeek Local Proxy URL để sử dụng tính năng ${featureName}.`;
    }
    return null;
  }
  if (provider === 'openai') {
    const authType = settings.openai_auth_type || (settings.openai_api_key ? 'api_key' : 'chatgpt_web');
    if (authType === 'api_key' && !settings.openai_api_key) {
      return `Vui lòng cấu hình OpenAI API Key để sử dụng tính năng ${featureName}.`;
    }
    return null;
  }
  if (provider === 'chatgpt_web') {
    // The companion reports missing sign-in or pairing details when called.
    return null;
  }
  if (provider === 'ollama') {
    if (!settings.ollama_url) {
      return `Vui lòng cấu hình Ollama URL để sử dụng tính năng ${featureName}.`;
    }
  }
  return null;
}

/**
 * Kiểm tra kết nối và độ phản hồi của nhà cung cấp AI đã cấu hình
 */
export async function testAIConnection(customSettings?: Partial<Settings>): Promise<AITestResult> {
  const currentSettings = await getSettings();
  const settings = { ...currentSettings, ...customSettings };
  const provider = settings.ai_provider;

  if (!provider || provider === 'none') {
    return {
      success: false,
      message: settings.language === 'en' 
        ? 'No AI provider selected. Please select an AI provider first.'
        : 'Chưa chọn nhà cung cấp AI. Vui lòng chọn một nhà cung cấp AI trước.'
    };
  }

  const missingWarning = getMissingConfigMessage(settings, settings.language === 'en' ? 'connection test' : 'kiểm tra kết nối');
  if (missingWarning) {
    return {
      success: false,
      message: missingWarning
    };
  }

  const startTime = Date.now();
  try {
    const testPrompt = settings.language === 'en'
      ? 'Hello! Reply with "OK: AI connection verified" in 1 line.'
      : 'Xin chào! Phản hồi lại: "OK: Kết nối AI hoạt động tốt" trong 1 câu ngắn.';

    const response = await callAI([{ role: 'user', content: testPrompt }], false, settings);
    const latencyMs = Date.now() - startTime;

    if (!response || response.trim().length === 0) {
      return {
        success: false,
        message: settings.language === 'en' ? 'AI returned an empty response.' : 'AI không trả về dữ liệu phản hồi.',
        latencyMs
      };
    }

    let modelName = '';
    if (provider === 'gemini') modelName = settings.gemini_model || 'gemini-2.5-flash-lite';
    else if (provider === 'deepseek') {
      const authType = settings.deepseek_auth_type || (settings.deepseek_api_key ? 'api_key' : 'local_proxy');
      if (authType === 'local_proxy') {
        modelName = `${settings.deepseek_model || 'deepseek-chat'} (FreeDeepseekAPI Proxy)`;
      } else if (authType === 'web_token') {
        modelName = `${settings.deepseek_model || 'deepseek-chat'} (Web Token)`;
      } else {
        modelName = `${settings.deepseek_model || 'deepseek-chat'} (API Key)`;
      }
    }
    else if (provider === 'openai') {
      const authType = settings.openai_auth_type || (settings.openai_api_key ? 'api_key' : 'chatgpt_web');
      modelName = authType === 'chatgpt_web' 
        ? `${settings.chatgpt_model || 'gpt-6.1-sol'} (ChatGPT)`
        : `${settings.openai_model || 'gpt-4o-mini'} (API Key)`;
    }
    else if (provider === 'chatgpt_web') modelName = `${settings.chatgpt_model || 'gpt-6.1-sol'} (ChatGPT)`;
    else if (provider === 'ollama') modelName = 'Ollama';

    return {
      success: true,
      message: settings.language === 'en' 
        ? `Connected successfully to ${provider.toUpperCase()} (${modelName})!` 
        : `Kết nối thành công đến ${provider.toUpperCase()} (${modelName})!`,
      model: modelName,
      latencyMs,
      sampleResponse: response.trim()
    };
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      message: error.message || (settings.language === 'en' ? 'Failed to connect to AI provider.' : 'Không thể kết nối đến nhà cung cấp AI.'),
      latencyMs
    };
  }
}

export async function translateSentence(text: string): Promise<string> {
  const settings = await getSettings();
  if (settings.ai_provider && settings.ai_provider !== 'none') {
    try {
      const aiResult = await translateSentenceWithAI(text);
      if (aiResult && !aiResult.startsWith('[Lỗi AI]')) {
        return aiResult;
      }
    } catch (err) {
      console.error("AI translation fallback to MyMemory:", err);
    }
  }
  return runFallbackTranslation(text);
}

export async function translateSentenceWithAI(text: string): Promise<string> {
  const settings = await getSettings();
  const warning = getMissingConfigMessage(settings, 'dịch AI');
  if (warning) return warning;
  
  try {
    return await callAI([
      { role: 'user', content: `Dịch câu/đoạn văn tiếng Anh sau sang tiếng Việt. Chỉ trả về kết quả dịch, không thêm giải thích hay ký tự khác: "${text}"` }
    ]);
  } catch (err: any) {
    console.error("AI translation failed:", err);
    return `[Lỗi AI] ${err.message || err}`;
  }
}

export async function summarizeSentence(text: string): Promise<string> {
  const settings = await getSettings();
  if (settings.ai_provider === 'none') {
    return runFallbackSummary(text);
  }
  
  try {
    return await callAI([
      { role: 'user', content: `Tóm tắt ngắn gọn khoảng 1-2 câu nội dung chính của đoạn văn tiếng Anh sau bằng tiếng Việt. Chỉ trả về kết quả tóm tắt: "${text}"` }
    ]);
  } catch (err: any) {
    console.error("AI summary failed:", err);
    
    if (err.message && err.message.includes('429')) {
      const lang = settings.language || 'vi';
      message.warning(
        lang === 'vi' 
          ? 'Lượt dùng AI bị giới hạn (429). Đang tóm tắt bằng công cụ đơn giản!' 
          : 'AI rate limit exceeded (429). Falling back to simple summary!'
      );
      return runFallbackSummary(text);
    }

    return `[Lỗi AI] ${err.message || err}`;
  }
}

export async function explainWord(word: string, definition?: string): Promise<string> {
  const settings = await getSettings();
  const warning = getMissingConfigMessage(settings, 'giải thích từ AI');
  if (warning) return warning;

  try {
    const prompt = `Giải thích từ tiếng Anh sau: "${word}"${definition ? ` (định nghĩa tiếng Anh: "${definition}")` : ''}.
Hãy cung cấp các thông tin sau bằng tiếng Việt:
1. Nghĩa tiếng Việt chính xác và hoàn cảnh sử dụng.
2. 2-3 từ đồng nghĩa hoặc cụm từ liên quan.
3. Một ví dụ tiếng Anh ngắn kèm dịch nghĩa tiếng Việt.
Trả về định dạng rõ ràng, ngắn gọn và dễ hiểu.`;
    
    return await callAI([{ role: 'user', content: prompt }]);
  } catch (err: any) {
    console.error("AI explainWord failed:", err);
    return `[Lỗi AI] ${err.message || err}`;
  }
}

export async function askAboutSentence(text: string, question: string): Promise<string> {
  const settings = await getSettings();
  const warning = getMissingConfigMessage(settings, 'hỏi đáp AI');
  if (warning) return warning;

  try {
    const prompt = `Tôi có đoạn văn/câu tiếng Anh sau:
"${text}"

Câu hỏi của tôi là: "${question}"

Hãy trả lời câu hỏi trên bằng tiếng Việt một cách chi tiết, giải thích cụ thể về mặt ngữ pháp, cấu trúc câu, từ vựng hoặc lý do chọn loại từ/thì tương tự như câu tôi đã hỏi. Trả về định dạng rõ ràng, ngắn gọn và dễ hiểu.`;
    
    return await callAI([{ role: 'user', content: prompt }]);
  } catch (err: any) {
    console.error("AI QA failed:", err);
    return `[Lỗi AI] ${err.message || err}`;
  }
}

export interface ChatHistoryItem {
  sender: 'user' | 'ai';
  text: string;
}

export async function sendChatMessage(contextSentence: string, history: ChatHistoryItem[]): Promise<string> {
  const settings = await getSettings();
  const warning = getMissingConfigMessage(settings, 'Chat AI');
  if (warning) return warning;

  try {
    const systemPrompt = contextSentence 
      ? `Tôi đang tự học tiếng Anh và đang đọc câu này: "${contextSentence}". Hãy đóng vai là một giáo viên dạy tiếng Anh nhiệt tình, giỏi ngữ pháp và cấu trúc câu. Giúp tôi giải đáp các câu hỏi học tập, phân tích thì, từ vựng hoặc cấu trúc câu dựa trên câu này hoặc các câu hỏi tiếng Anh bất kỳ khác của tôi.`
      : `Hãy đóng vai là một giáo viên dạy tiếng Anh nhiệt tình, giỏi ngữ pháp và cấu trúc câu. Giúp tôi giải đáp mọi thắc mắc học tập về ngữ pháp, từ vựng, phát âm, dịch thuật, viết lại câu hoặc phân tích cấu trúc ngữ pháp.`;
      
    const messages = [];
    messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'assistant', content: 'Chào bạn! Mình là giáo viên trợ lý tiếng Anh AI của bạn. Hãy gửi cho mình bất kỳ câu hỏi nào về từ vựng, ngữ pháp, dịch thuật hoặc phân tích câu nhé! Mình sẵn sàng hỗ trợ bạn.' });
    
    history.forEach(msg => {
      messages.push({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      });
    });

    return await callAI(messages);
  } catch (err: any) {
    console.error("AI Chat failed:", err);
    return `[Lỗi AI] ${err.message || err}`;
  }
}

export interface ExtractedGrammar {
  title: string;
  content: string;
  example: string;
  tags: string[];
}

export async function extractGrammarNote(aiResponseText: string): Promise<ExtractedGrammar | null> {
  const settings = await getSettings();
  if (settings.ai_provider === 'none') {
    return null;
  }
  try {
    const prompt = `Phân tích phần giải thích cấu trúc ngữ pháp sau đây của giáo viên tiếng Anh:
"${aiResponseText}"

Hãy trích xuất thông tin ngữ pháp cốt lõi và trả về DUY NHẤT một đối tượng JSON có định dạng chính xác sau (không chứa markdown wrap \`\`\`json hay bất kỳ ký tự thừa nào ngoài JSON):
{
  "title": "Tên cấu trúc ngữ pháp ngắn gọn (Ví dụ: Present Perfect Tense, Cấu trúc Used to)",
  "content": "Giải thích ngắn gọn cách dùng, quy tắc cơ bản bằng tiếng Việt",
  "example": "Câu ví dụ tiếng Anh tiêu biểu kèm dịch nghĩa tiếng Việt",
  "tags": ["danh sách 2-3 thẻ tag phân loại liên quan dưới dạng tiếng Anh viết liền không dấu, ví dụ: tense, comparison, modal-verb"]
}`;

    const rawText = await callAI([{ role: 'user', content: prompt }], true);
    const jsonText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonText);
    return {
      title: parsed.title || 'Grammar Note',
      content: parsed.content || '',
      example: parsed.example || '',
      tags: Array.isArray(parsed.tags) ? parsed.tags : []
    };
  } catch (err) {
    console.error("AI Extract Grammar failed:", err);
    return null;
  }
}

export interface WritingEvaluation {
  isCorrect: boolean;
  score: number;
  grammarFeedback: string;
  improvedSentence: string;
}

/**
 * Chấm điểm và sửa lỗi câu người dùng tự viết với từ vựng đã học
 */
export async function evaluateWritingSentence(word: string, userSentence: string): Promise<WritingEvaluation> {
  const settings = await getSettings();
  if (!settings.ai_provider || settings.ai_provider === 'none') {
    return {
      isCorrect: true,
      score: 80,
      grammarFeedback: 'Bạn đã hoàn thành câu viết (Bật AI trong Cài đặt để nhận phản hồi chi tiết từ giáo viên AI).',
      improvedSentence: userSentence
    };
  }

  const prompt = `Bạn là giáo viên tiếng Anh chấm bài viết.
Người học đang đặt câu chứa từ vựng: "${word}".
Câu người học đã viết: "${userSentence}".

Hãy chấm điểm và nhận xét chi tiết. Trả về DUY NHẤT một đối tượng JSON (không thêm markdown \`\`\`json hay văn bản thừa):
{
  "isCorrect": true/false (true nếu đúng ngữ pháp và dùng từ đúng ngữ cảnh),
  "score": điểm số từ 0 đến 100,
  "grammarFeedback": "nhận xét ngắn gọn, ân cần bằng tiếng Việt về ngữ pháp, trật tự từ và cách dùng từ",
  "improvedSentence": "câu viết lại cho tự nhiên và chuẩn như người bản xứ"
}`;

  try {
    const raw = await callAI([{ role: 'user', content: prompt }], true);
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      isCorrect: typeof parsed.isCorrect === 'boolean' ? parsed.isCorrect : true,
      score: typeof parsed.score === 'number' ? parsed.score : 85,
      grammarFeedback: parsed.grammarFeedback || 'Câu viết rất tốt!',
      improvedSentence: parsed.improvedSentence || userSentence
    };
  } catch (err: any) {
    console.error("AI Writing Evaluation failed:", err);
    return {
      isCorrect: true,
      score: 80,
      grammarFeedback: 'Đã ghi nhận câu viết của bạn.',
      improvedSentence: userSentence
    };
  }
}

export interface AIGrammarExplanation {
  title: string;
  formula: string;
  explanation: string;
  examples: {
    english: string;
    vietnamese: string;
  }[];
  notes?: string;
  tags: string[];
}

/**
 * Tra cứu, phân tích cấu trúc hoặc câu hỏi ngữ pháp chuyên sâu bằng AI
 */
export async function searchGrammarWithAI(query: string, customSettings?: Partial<Settings>): Promise<AIGrammarExplanation> {
  const currentSettings = await getSettings();
  const settings = { ...currentSettings, ...customSettings };
  if (!settings.ai_provider || settings.ai_provider === 'none') {
    throw new Error(settings.language === 'en'
      ? 'Please enable an AI provider or turn on DeepSeek Local Proxy to use AI Grammar Search.'
      : 'Vui lòng bật AI Provider hoặc bật DeepSeek Local Proxy trên thanh công cụ để tra cứu ngữ pháp bằng AI.');
  }

  const prompt = `Bạn là một chuyên gia ngôn ngữ và giáo viên tiếng Anh hàng đầu.
Người học muốn tra cứu và tìm hiểu sâu về cấu trúc hoặc câu hỏi ngữ pháp:
"${query}"

Hãy phân tích toàn diện, chính xác và trả về DUY NHẤT một đối tượng JSON hợp lệ (không chứa markdown \`\`\`json hay bất kỳ văn bản thừa bên ngoài JSON) theo cấu trúc sau:
{
  "title": "Tên cấu trúc/chủ đề ngữ pháp ngắn gọn, chuẩn mực (ví dụ: Third Conditional (Câu điều kiện loại 3))",
  "formula": "Công thức / Cấu trúc ngữ pháp tổng quát rõ ràng (ví dụ: If + S + had + V3/ed, S + would/could + have + V3/ed)",
  "explanation": "Giải thích chi tiết nhưng súc tích về cách dùng, bản chất ngữ pháp và ngữ cảnh áp dụng bằng tiếng Việt",
  "examples": [
    {
      "english": "Câu ví dụ tiếng Anh tự nhiên, chuẩn bản xứ 1",
      "vietnamese": "Dịch nghĩa tiếng Việt chuẩn xác 1"
    },
    {
      "english": "Câu ví dụ tiếng Anh 2",
      "vietnamese": "Dịch nghĩa tiếng Việt 2"
    }
  ],
  "notes": "Lưu ý quan trọng, các biến thể đặc biệt, dạng đảo ngữ hoặc các bẫy trắc nghiệm hay gặp bằng tiếng Việt",
  "tags": ["danh sách 2-4 tags phân loại viết bằng tiếng Anh không dấu, ví dụ: conditional, advanced, past-unreal"]
}`;

  const raw = await callAI([{ role: 'user', content: prompt }], true, settings);
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  return {
    title: parsed.title || query,
    formula: parsed.formula || '',
    explanation: parsed.explanation || '',
    examples: Array.isArray(parsed.examples) && parsed.examples.length > 0
      ? parsed.examples
      : [{ english: parsed.example || '', vietnamese: '' }],
    notes: parsed.notes || '',
    tags: Array.isArray(parsed.tags) ? parsed.tags : []
  };
}

export interface AIGeneratedWord {
  word: string;
  phonetic: string;
  meaning: string;
  description: string;
  example: string;
  tags: string[];
}

/**
 * Sinh từ vựng chuyên ngành hoặc theo chủ đề và trình độ bằng AI
 */
export async function generateVocabularyByTopicWithAI(
  topic: string,
  count = 5,
  level = 'B1-B2',
  customSettings?: Partial<Settings>
): Promise<AIGeneratedWord[]> {
  const currentSettings = await getSettings();
  const settings = { ...currentSettings, ...customSettings };
  if (!settings.ai_provider || settings.ai_provider === 'none') {
    throw new Error(settings.language === 'en'
      ? 'Please enable an AI provider or turn on DeepSeek Local Proxy to generate vocabulary.'
      : 'Vui lòng bật AI Provider hoặc bật DeepSeek Local Proxy để sinh từ vựng bằng AI.');
  }

  const prompt = `Bạn là chuyên gia giảng dạy tiếng Anh. Hãy sinh ra danh sách gồm chính xác ${count} từ vựng hoặc cụm từ (collocations/idioms) tiếng Anh đắt giá nhất thuộc chủ đề: "${topic}" với trình độ ${level}.
Trả về DUY NHẤT một đối tượng JSON có định dạng:
{
  "words": [
    {
      "word": "từ hoặc cụm từ (ví dụ: bottleneck)",
      "phonetic": "/phiên âm IPA/",
      "meaning": "nghĩa tiếng Việt thông dụng, cô đọng",
      "description": "loại từ [noun/verb/adj] và giải thích ngắn gọn",
      "example": "câu ví dụ tiếng Anh thực tế trong ngữ cảnh công việc/cuộc sống",
      "tags": ["2-3 thẻ tag phân loại liên quan"]
    }
  ]
}`;

  const raw = await callAI([{ role: 'user', content: prompt }], true, settings);
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);
  const wordsList = Array.isArray(parsed.words) ? parsed.words : (Array.isArray(parsed) ? parsed : []);
  
  return wordsList.map((item: any) => ({
    word: String(item.word || '').trim(),
    phonetic: String(item.phonetic || '').trim(),
    meaning: String(item.meaning || '').trim(),
    description: String(item.description || '').trim(),
    example: String(item.example || '').trim(),
    tags: Array.isArray(item.tags) ? item.tags : [topic.toLowerCase().replace(/\s+/g, '-')]
  })).filter((w: AIGeneratedWord) => w.word && w.meaning);
}

export interface AIDailyInsight {
  greeting: string;
  tip: string;
  recommendedFocus: string;
  example: string;
}

/**
 * Sinh gợi ý và lời khuyên học tập thông minh mỗi ngày từ AI
 */
export async function getAIDailyInsight(
  stats: { totalWords: number; missedWords: string[]; masteredWordsCount: number },
  customSettings?: Partial<Settings>
): Promise<AIDailyInsight> {
  const currentSettings = await getSettings();
  const settings = { ...currentSettings, ...customSettings };
  if (!settings.ai_provider || settings.ai_provider === 'none') {
    return {
      greeting: 'Chào bạn! Hãy tiếp tục hành trình học tiếng Anh hôm nay.',
      tip: 'Ôn tập ngắt quãng (Spaced Repetition) mỗi ngày 10-15 phút mang lại hiệu quả gấp 3 lần học dồn cuối tuần.',
      recommendedFocus: 'Ôn tập 10 từ vựng đến hạn trong Flashcards.',
      example: 'Consistency is the key to mastery.'
    };
  }

  const prompt = `Bạn là huấn luyện viên tiếng Anh AI truyền cảm hứng.
Thông tin học viên hiện tại:
- Tổng số từ vựng đã lưu: ${stats.totalWords}
- Số từ đã thành thạo: ${stats.masteredWordsCount}
- Các từ hay bị sai gần đây: ${stats.missedWords.length > 0 ? stats.missedWords.slice(0, 3).join(', ') : 'Chưa có từ nào bị sai nhiều'}

Hãy đưa ra lời khuyên học tập hôm nay và trả về DUY NHẤT một đối tượng JSON:
{
  "greeting": "Lời chào ngắn gọn, tràn đầy năng lượng bằng tiếng Việt",
  "tip": "Mẹo học tập hoặc phân biệt từ/ngữ pháp hữu ích bằng tiếng Việt",
  "recommendedFocus": "Gợi ý mục tiêu trọng tâm cần hoàn thành hôm nay",
  "example": "Một câu trích dẫn hoặc câu ví dụ tiếng Anh truyền cảm hứng kèm dịch nghĩa tiếng Việt"
}`;

  try {
    const raw = await callAI([{ role: 'user', content: prompt }], true, settings);
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      greeting: parsed.greeting || 'Chào bạn! Chúc bạn một ngày học tập hiệu quả.',
      tip: parsed.tip || 'Hãy biến tiếng Anh thành thói quen hàng ngày qua các bài viết chuyên ngành.',
      recommendedFocus: parsed.recommendedFocus || 'Ôn tập các từ vựng đến hạn hôm nay.',
      example: parsed.example || 'Every master was once a disaster. (Bất kỳ bậc thầy nào cũng từng là người mới bắt đầu.)'
    };
  } catch {
    return {
      greeting: 'Chào bạn! Chúc bạn một ngày học tập hiệu quả.',
      tip: 'Hãy học theo cụm từ (Collocations) thay vì học từ đơn lẻ để nói tự nhiên hơn.',
      recommendedFocus: 'Hoàn thành mục tiêu flashcard hôm nay.',
      example: 'Small daily improvements over time lead to stunning results.'
    };
  }
}

export type WritingTone = 'professional' | 'concise' | 'casual' | 'grammar_only';

export interface WritingPolishCorrection {
  original: string;
  replacement: string;
  reason: string;
}

export interface WritingPolishResult {
  improvedText: string;
  originalText: string;
  tone: WritingTone;
  corrections: WritingPolishCorrection[];
  explanation: string;
}

export async function polishWritingWithAI(
  text: string,
  tone: WritingTone = 'professional',
  customSettings?: Partial<Settings>
): Promise<WritingPolishResult> {
  const currentSettings = await getSettings();
  const settings = { ...currentSettings, ...customSettings };
  if (!settings.ai_provider || settings.ai_provider === 'none') {
    throw new Error('Chưa cấu hình AI provider (Gemini, DeepSeek, ChatGPT, hoặc Ollama).');
  }

  const toneInstructions = {
    professional: 'Trang trọng, lịch thiệp, chuẩn mực tiếng Anh công sở (cho email, báo cáo, ticket công việc, trao đổi khách hàng).',
    concise: 'Súc tích, trực diện, loại bỏ từ thừa thãi (cho GitHub PR description, git commit, Slack message, ghi chú kỹ thuật).',
    casual: 'Thân thiện, tự nhiên, sinh động như người bản xứ giao tiếp hàng ngày.',
    grammar_only: 'Chỉ sửa lỗi ngữ pháp, chính tả, giới từ, mạo từ; tuyệt đối giữ nguyên cấu trúc và ý diễn đạt ban đầu.'
  }[tone];

  const prompt = `Bạn là chuyên gia biên tập tiếng Anh bản xứ hàng đầu thế giới.
Văn bản của người dùng:
"""${text}"""

Phong cách yêu cầu: ${tone} (${toneInstructions})

Nhiệm vụ:
1. Sửa toàn bộ lỗi chính tả, ngữ pháp, thì động từ, mạo từ (a/an/the), giới từ.
2. Nâng cấp câu văn cho tự nhiên, mượt mà và đúng chuẩn người bản ngữ theo phong cách "${tone}".
3. Liệt kê các điểm sửa đổi cụ thể và lý do giải thích bằng tiếng Việt.

Hãy trả về DUY NHẤT một đối tượng JSON hợp lệ (không kèm bất kỳ văn bản thừa nào ngoài JSON):
{
  "improvedText": "đoạn văn bản tiếng Anh sau khi đã sửa và nâng cấp hoàn chỉnh",
  "originalText": "${text.replace(/"/g, '\\"')}",
  "tone": "${tone}",
  "corrections": [
    {
      "original": "từ hoặc cụm từ bị lỗi/chưa tự nhiên",
      "replacement": "từ hoặc cụm từ thay thế",
      "reason": "lý do sửa ngắn gọn bằng tiếng Việt (ví dụ: dùng make thay vì do; sửa in thành on)"
    }
  ],
  "explanation": "tóm tắt ngắn gọn 1-2 câu nhận xét về câu văn bằng tiếng Việt"
}`;

  const raw = await callAI([{ role: 'user', content: prompt }], true, settings);
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  return {
    improvedText: parsed.improvedText || text,
    originalText: text,
    tone,
    corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
    explanation: parsed.explanation || 'Đã nâng cấp câu văn theo chuẩn người bản ngữ.'
  };
}



