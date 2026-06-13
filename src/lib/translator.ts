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

    // 2. Fetch Vietnamese translation (use Gemini if configured, otherwise fallback to MyMemory)
    const settings = await getSettings();
    let vietnameseMeaning = '';

    if (settings.ai_provider === 'gemini' && settings.gemini_api_key) {
      try {
        const model = settings.gemini_model || 'gemini-2.5-flash-lite';
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${settings.gemini_api_key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Dịch từ/cụm từ tiếng Anh sau sang tiếng Việt (chỉ trả về nghĩa tiếng Việt chính xác và ngắn gọn nhất, cách nhau bằng dấu phẩy nếu có nhiều nghĩa, không thêm bất kỳ văn bản giải thích hay ký tự nào khác): "${word}"` }] }]
          })
        });
        if (response.ok) {
          const data = await response.json();
          vietnameseMeaning = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        }
      } catch (err) {
        console.error("Gemini basic translation failed, falling back:", err);
      }
    }

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

export async function translateSentence(text: string): Promise<string> {
  const settings = await getSettings();
  if (settings.ai_provider === 'gemini' && settings.gemini_api_key) {
    try {
      const model = settings.gemini_model || 'gemini-2.5-flash-lite';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${settings.gemini_api_key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Dịch câu/đoạn văn tiếng Anh sau sang tiếng Việt. Chỉ trả về kết quả dịch, không thêm giải thích hay ký tự khác: "${text}"` }] }]
        })
      });
      if (response.ok) {
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      }
    } catch (err) {
      console.error("Gemini translation failed:", err);
    }
  }
  return runFallbackTranslation(text);
}

export async function summarizeSentence(text: string): Promise<string> {
  const settings = await getSettings();
  
  // If Gemini key is set, use it
  if (settings.ai_provider === 'gemini' && settings.gemini_api_key) {
    try {
      const model = settings.gemini_model || 'gemini-2.5-flash-lite';
      console.log(`[Gemini] Summarizing with API Key: ${settings.gemini_api_key.substring(0, 6)}... using model: ${model}`);
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${settings.gemini_api_key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Tóm tắt ngắn gọn khoảng 1-2 câu nội dung chính của đoạn văn tiếng Anh sau bằng tiếng Việt. Chỉ trả về kết quả tóm tắt: "${text}"` }] }]
        })
      });
      if (response.ok) {
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        const errText = await response.text();
        console.error("Gemini summary API error:", response.status, errText);
        let detail = response.statusText;
        try {
          const parsed = JSON.parse(errText);
          detail = parsed.error?.message || detail;
        } catch (e) {}

        if (response.status === 429) {
          const lang = settings.language || 'vi';
          message.warning(
            lang === 'vi' 
              ? 'Lượt dùng Gemini bị giới hạn (429). Đang tóm tắt bằng công cụ đơn giản!' 
              : 'Gemini rate limit exceeded (429). Falling back to simple summary!'
          );
          return runFallbackSummary(text);
        }

        return `[Lỗi Gemini API] Mã lỗi ${response.status}: ${detail}. Vui lòng kiểm tra lại API Key trong phần Cài đặt.`;
      }
    } catch (err: any) {
      console.error("Gemini summary failed:", err);
      return `[Lỗi kết nối Gemini] ${err.message || err}`;
    }
  }

  return runFallbackSummary(text);
}

export async function explainWord(word: string, definition?: string): Promise<string> {
  const settings = await getSettings();
  
  if (settings.ai_provider === 'gemini' && settings.gemini_api_key) {
    try {
      const model = settings.gemini_model || 'gemini-2.5-flash-lite';
      console.log(`[Gemini] Explaining word with API Key: ${settings.gemini_api_key.substring(0, 6)}... using model: ${model}`);
      const prompt = `Giải thích từ tiếng Anh sau: "${word}"${definition ? ` (định nghĩa tiếng Anh: "${definition}")` : ''}.
Hãy cung cấp các thông tin sau bằng tiếng Việt:
1. Nghĩa tiếng Việt chính xác và hoàn cảnh sử dụng.
2. 2-3 từ đồng nghĩa hoặc cụm từ liên quan.
3. Một ví dụ tiếng Anh ngắn kèm dịch nghĩa tiếng Việt.
Trả về định dạng rõ ràng, ngắn gọn và dễ hiểu.`;
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${settings.gemini_api_key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      if (response.ok) {
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        const errText = await response.text();
        console.error("Gemini explainWord API error:", response.status, errText);
        let detail = response.statusText;
        try {
          const parsed = JSON.parse(errText);
          detail = parsed.error?.message || detail;
        } catch (e) {}

        if (response.status === 429) {
          const lang = settings.language || 'vi';
          message.warning(
            lang === 'vi' 
              ? 'Lượt dùng Gemini bị giới hạn (429). Giải nghĩa từ AI tạm thời không khả dụng.' 
              : 'Gemini rate limit exceeded (429). AI word explanation is temporarily unavailable.'
          );
          return lang === 'vi' 
            ? 'Lượt dùng Gemini bị giới hạn (429). Vui lòng thử lại sau.' 
            : 'Gemini rate limit exceeded (429). Please try again later.';
        }

        return `[Lỗi Gemini API] Mã lỗi ${response.status}: ${detail}. Vui lòng kiểm tra lại API Key trong phần Cài đặt.`;
      }
    } catch (err: any) {
      console.error("Gemini explainWord failed:", err);
      return `[Lỗi kết nối Gemini] ${err.message || err}`;
    }
  }
  return 'Vui lòng cấu hình Gemini API Key để sử dụng tính năng giải thích từ AI.';
}

export async function askAboutSentence(text: string, question: string): Promise<string> {
  const settings = await getSettings();
  
  if (settings.ai_provider === 'gemini' && settings.gemini_api_key) {
    try {
      const model = settings.gemini_model || 'gemini-2.5-flash-lite';
      console.log(`[Gemini] QA with API Key: ${settings.gemini_api_key.substring(0, 6)}... using model: ${model}`);
      const prompt = `Tôi có đoạn văn/câu tiếng Anh sau:
"${text}"

Câu hỏi của tôi là: "${question}"

Hãy trả lời câu hỏi trên bằng tiếng Việt một cách chi tiết, giải thích cụ thể về mặt ngữ pháp, cấu trúc câu, từ vựng hoặc lý do chọn loại từ/thì tương tự như câu tôi đã hỏi. Trả về định dạng rõ ràng, ngắn gọn và dễ hiểu.`;
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${settings.gemini_api_key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      if (response.ok) {
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        const errText = await response.text();
        console.error("Gemini QA API error:", response.status, errText);
        let detail = response.statusText;
        try {
          const parsed = JSON.parse(errText);
          detail = parsed.error?.message || detail;
        } catch (e) {}

        if (response.status === 429) {
          const lang = settings.language || 'vi';
          message.warning(
            lang === 'vi' 
              ? 'Lượt dùng Gemini bị giới hạn (429). Hỏi đáp AI tạm thời không khả dụng.' 
              : 'Gemini rate limit exceeded (429). AI Q&A is temporarily unavailable.'
          );
          return lang === 'vi' 
            ? 'Lượt dùng Gemini bị giới hạn (429). Vui lòng thử lại sau.' 
            : 'Gemini rate limit exceeded (429). Please try again later.';
        }

        return `[Lỗi Gemini API] Mã lỗi ${response.status}: ${detail}. Vui lòng kiểm tra lại API Key trong phần Cài đặt.`;
      }
    } catch (err: any) {
      console.error("Gemini QA failed:", err);
      return `[Lỗi kết nối Gemini] ${err.message || err}`;
    }
  }
  return 'Vui lòng cấu hình Gemini API Key để sử dụng tính năng hỏi đáp AI.';
}

export interface ChatHistoryItem {
  sender: 'user' | 'ai';
  text: string;
}

export async function sendChatMessage(contextSentence: string, history: ChatHistoryItem[]): Promise<string> {
  const settings = await getSettings();
  
  if (settings.ai_provider === 'gemini' && settings.gemini_api_key) {
    try {
      const model = settings.gemini_model || 'gemini-2.5-flash-lite';
      console.log(`[Gemini] Chat with API Key: ${settings.gemini_api_key.substring(0, 6)}... using model: ${model}`);
      
      const contents = [];
      
      // 1. Prepend the system & context prompt
      const systemPrompt = contextSentence 
        ? `Tôi đang tự học tiếng Anh và đang đọc câu này: "${contextSentence}". Hãy đóng vai là một giáo viên dạy tiếng Anh nhiệt tình, giỏi ngữ pháp và cấu trúc câu. Giúp tôi giải đáp các câu hỏi học tập, phân tích thì, từ vựng hoặc cấu trúc câu dựa trên câu này hoặc các câu hỏi tiếng Anh bất kỳ khác của tôi.`
        : `Hãy đóng vai là một giáo viên dạy tiếng Anh nhiệt tình, giỏi ngữ pháp và cấu trúc câu. Giúp tôi giải đáp mọi thắc mắc học tập về ngữ pháp, từ vựng, phát âm, dịch thuật, viết lại câu hoặc phân tích cấu trúc ngữ pháp.`;
        
      contents.push({
        role: 'user',
        parts: [{ text: systemPrompt }]
      });
      
      contents.push({
        role: 'model',
        parts: [{ text: 'Chào bạn! Mình là giáo viên trợ lý tiếng Anh AI của bạn. Hãy gửi cho mình bất kỳ câu hỏi nào về từ vựng, ngữ pháp, dịch thuật hoặc phân tích câu nhé! Mình sẵn sàng hỗ trợ bạn.' }]
      });
      
      // 2. Map conversation history turns
      history.forEach(msg => {
        contents.push({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        });
      });
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${settings.gemini_api_key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        const errText = await response.text();
        console.error("Gemini Chat API error:", response.status, errText);
        let detail = response.statusText;
        try {
          const parsed = JSON.parse(errText);
          detail = parsed.error?.message || detail;
        } catch (e) {}

        if (response.status === 429) {
          const lang = settings.language || 'vi';
          message.warning(
            lang === 'vi'
              ? 'Lượt dùng Gemini bị giới hạn (429). Chat AI tạm thời không khả dụng.'
              : 'Gemini rate limit exceeded (429). AI Chat is temporarily unavailable.'
          );
          return lang === 'vi' 
            ? 'Lượt dùng Gemini bị giới hạn (429). Vui lòng thử lại sau.' 
            : 'Gemini rate limit exceeded (429). Please try again later.';
        }

        return `[Lỗi Gemini API] Mã lỗi ${response.status}: ${detail}. Vui lòng kiểm tra lại API Key trong phần Cài đặt.`;
      }
    } catch (err: any) {
      console.error("Gemini Chat failed:", err);
      return `[Lỗi kết nối Gemini] ${err.message || err}`;
    }
  }
  return 'Vui lòng cấu hình Gemini API Key để sử dụng tính năng Chat AI.';
}

export interface ExtractedGrammar {
  title: string;
  content: string;
  example: string;
  tags: string[];
}

export async function extractGrammarNote(aiResponseText: string): Promise<ExtractedGrammar | null> {
  const settings = await getSettings();
  
  if (settings.ai_provider === 'gemini' && settings.gemini_api_key) {
    try {
      const model = settings.gemini_model || 'gemini-2.5-flash-lite';
      console.log(`[Gemini] Extracting grammar with model: ${model}`);
      
      const prompt = `Phân tích phần giải thích cấu trúc ngữ pháp sau đây của giáo viên tiếng Anh:
"${aiResponseText}"

Hãy trích xuất thông tin ngữ pháp cốt lõi và trả về DUY NHẤT một đối tượng JSON có định dạng chính xác sau (không chứa markdown wrap \`\`\`json hay bất kỳ ký tự thừa nào ngoài JSON):
{
  "title": "Tên cấu trúc ngữ pháp ngắn gọn (Ví dụ: Present Perfect Tense, Cấu trúc Used to)",
  "content": "Giải thích ngắn gọn cách dùng, quy tắc cơ bản bằng tiếng Việt",
  "example": "Câu ví dụ tiếng Anh tiêu biểu kèm dịch nghĩa tiếng Việt",
  "tags": ["danh sách 2-3 thẻ tag phân loại liên quan dưới dạng tiếng Anh viết liền không dấu, ví dụ: tense, comparison, modal-verb"]
}`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${settings.gemini_api_key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonText);
        return {
          title: parsed.title || 'Grammar Note',
          content: parsed.content || '',
          example: parsed.example || '',
          tags: Array.isArray(parsed.tags) ? parsed.tags : []
        };
      } else {
        if (response.status === 429) {
          const lang = settings.language || 'vi';
          message.warning(
            lang === 'vi'
              ? 'Lượt dùng Gemini bị giới hạn (429). Không thể tự động trích xuất ngữ pháp.'
              : 'Gemini rate limit exceeded (429). Cannot extract grammar structure.'
          );
        }
        console.error("Gemini Extract Grammar API error:", response.status, await response.text());
      }
    } catch (err) {
      console.error("Gemini Extract Grammar failed:", err);
    }
  }
  return null;
}

