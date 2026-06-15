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

/**
 * Lớp 2: Basic Translation using Free Dictionary API + MyMemory API (English to Vietnamese)
 * Đây là API public miễn phí, dùng khi user chưa có API Key của AI.
 */
export async function fetchBasicMeaning(word: string): Promise<TranslationResult | null> {
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

    // 2. Fetch Vietnamese translation (default to MyMemory for basic free translation)
    let vietnameseMeaning = '';

    // Fallback to MyMemory if Gemini didn't return a meaning
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

import { getSettings } from './settings';
import { message } from 'antd';

async function runFallbackTranslation(text: string): Promise<string> {
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

async function callAI(messages: { role: string; content: string }[], isJson = false): Promise<string> {
  const settings = await getSettings();
  const provider = settings.ai_provider;

  if (provider === 'gemini') {
    if (!settings.gemini_api_key) {
      throw new Error('Gemini API Key is not configured.');
    }
    const model = settings.gemini_model || 'gemini-2.5-flash-lite';
    
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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${settings.gemini_api_key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });

    if (response.ok) {
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      const errText = await response.text();
      let msg = `Gemini API error (Status ${response.status})`;
      try {
        const parsed = JSON.parse(errText);
        msg = parsed.error?.message || msg;
      } catch (e) {}
      throw new Error(msg);
    }
  }

  if (provider === 'openai') {
    if (!settings.openai_api_key) {
      throw new Error('OpenAI API Key is not configured.');
    }
    const reqBody: any = {
      model: 'gpt-4o-mini',
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
  if (provider === 'openai') {
    if (!settings.openai_api_key) {
      return `Vui lòng cấu hình OpenAI API Key để sử dụng tính năng ${featureName}.`;
    }
  }
  if (provider === 'ollama') {
    if (!settings.ollama_url) {
      return `Vui lòng cấu hình Ollama URL để sử dụng tính năng ${featureName}.`;
    }
  }
  return null;
}

export async function translateSentence(text: string): Promise<string> {
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

