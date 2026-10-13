import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  fetchBasicMeaning, 
  fetchWordWithAI, 
  fetchPublicDictionary, 
  translateWithGoogleFree,
  translateSentenceWithAI, 
  sendChatMessage, 
  extractGrammarNote,
  testAIConnection,
  searchGrammarWithAI,
  generateVocabularyByTopicWithAI,
  getAIDailyInsight
} from './translator';
import { saveSettings, clearMockStorage } from './settings';

// Mock the global fetch function
globalThis.fetch = vi.fn();

const mockChatGPTCompanion = (answer: string) => {
    const sendMessage = vi.fn(async () => ({ text: answer }));
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => ({ chatgpt_pairing_code: 'test-pairing-code-of-adequate-length' })) } },
      runtime: { sendMessage }
    });
    return sendMessage;
};

describe('Translator API (Free Dictionary vs AI)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockStorage();
  });

  it('should fetch meaning successfully for a valid word with public dictionary', async () => {
    const mockResponse = [
      {
        word: 'implement',
        phonetic: '/ˈɪmplɪmənt/',
        meanings: [
          {
            partOfSpeech: 'verb',
            definitions: [
              { definition: 'To put into practical effect; carry out.' }
            ]
          }
        ]
      }
    ];

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const result = await fetchPublicDictionary('implement');
    
    expect(globalThis.fetch).toHaveBeenCalledWith('https://api.dictionaryapi.dev/api/v2/entries/en/implement');
    expect(result).toBeDefined();
    expect(result?.word).toBe('implement');
    expect(result?.phonetic).toBe('/ˈɪmplɪmənt/');
    expect(result?.meanings[0].partOfSpeech).toBe('verb');
  });

  it('should return null if the word is not found (404)', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: false
    });

    const result = await fetchPublicDictionary('invalidwordthatdoesnotexist');
    
    expect(result).toBeNull();
  });

  it('should use AI directly when AI provider is configured and NOT call public dictionary APIs', async () => {
    // 1. AI configured: should call AI directly
    await saveSettings({
      ai_provider: 'gemini',
      gemini_api_key: 'fake_key'
    });

    const geminiMockResponse = {
      candidates: [{ 
        content: { 
          parts: [{ 
            text: JSON.stringify({
              word: 'implement',
              phonetic: '/ˈɪmplɪmənt/',
              vietnameseMeaning: 'thực thi, áp dụng',
              meanings: [{
                partOfSpeech: 'verb',
                definitions: [{ definition: 'To put into effect', example: 'Implement a plan' }]
              }]
            })
          }] 
        } 
      }]
    };

    (globalThis.fetch as any).mockImplementation((url: string) => {
      if (url.includes('googleapis.com')) {
        return Promise.resolve({ ok: true, json: async () => geminiMockResponse });
      }
      return Promise.resolve({ ok: false });
    });

    const aiResult = await fetchBasicMeaning('implement');
    expect(aiResult?.vietnameseMeaning).toBe('thực thi, áp dụng');
    expect(aiResult?.phonetic).toBe('/ˈɪmplɪmənt/');
    expect(aiResult?.meanings[0].partOfSpeech).toBe('verb');

    // Test fetchWordWithAI directly
    const directAi = await fetchWordWithAI('implement');
    expect(directAi?.vietnameseMeaning).toBe('thực thi, áp dụng');

    // Verify public dictionary APIs were NOT called
    const fetchCalls = (globalThis.fetch as any).mock.calls;
    const calledPublicDict = fetchCalls.some(([url]: [string]) => url.includes('dictionaryapi.dev'));
    expect(calledPublicDict).toBe(false);
  });

  it('should translate using Google Translate Free endpoint', async () => {
    const googleMockResponse = [[['thực thi (Google Free)', 'implement', null, null, 1]], null, 'en'];
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => googleMockResponse
    });

    const translated = await translateWithGoogleFree('implement');
    expect(translated).toBe('thực thi (Google Free)');
  });

  it('should fallback to Google Translate Free / public dictionary when AI provider is none', async () => {
    await saveSettings({
      ai_provider: 'none'
    });

    const dictMockResponse = [
      {
        word: 'implement',
        phonetic: '/ˈɪmplɪmənt/',
        meanings: [{ partOfSpeech: 'verb', definitions: [{ definition: 'Carry out' }] }]
      }
    ];

    const googleMockResponse = [[['thực thi (Google Free)', 'implement', null, null, 1]], null, 'en'];

    (globalThis.fetch as any).mockImplementation((url: string) => {
      if (url.includes('dictionaryapi.dev')) {
        return Promise.resolve({ ok: true, json: async () => dictMockResponse });
      }
      if (url.includes('translate.googleapis.com')) {
        return Promise.resolve({ ok: true, json: async () => googleMockResponse });
      }
      return Promise.resolve({ ok: false });
    });

    const freeResult = await fetchBasicMeaning('implement');
    expect(freeResult?.vietnameseMeaning).toBe('thực thi (Google Free)');
    expect(freeResult?.phonetic).toBe('/ˈɪmplɪmənt/');
    
    const fetchCalls = (globalThis.fetch as any).mock.calls;
    const calledGeminiAI = fetchCalls.some(([url]: [string]) => url.includes('generativelanguage.googleapis.com'));
    expect(calledGeminiAI).toBe(false);
  });

  it('should call Gemini for on-demand sentence translation if gemini is configured', async () => {
    await saveSettings({
      ai_provider: 'gemini',
      gemini_api_key: 'fake_key'
    });

    const geminiMockResponse = {
      candidates: [{ content: { parts: [{ text: 'Đây là bản dịch AI.' }] } }]
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => geminiMockResponse
    });

    const result = await translateSentenceWithAI('This is a sentence.');
    expect(result).toBe('Đây là bản dịch AI.');
    expect(globalThis.fetch).toHaveBeenCalled();
  });
});

describe('sendChatMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockStorage();
  });

  it('should return warning if API key is not configured', async () => {
    const result = await sendChatMessage('test sentence', []);
    expect(result).toContain('Vui lòng cấu hình Gemini API Key');
  });

  it('should send chat message and return response from Gemini API', async () => {
    await saveSettings({
      ai_provider: 'gemini',
      gemini_api_key: 'fake_gemini_key_abc',
      gemini_model: 'gemini-2.5-flash-lite'
    });

    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              { text: 'Hello, this is a response from Gemini!' }
            ]
          }
        }
      ]
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const result = await sendChatMessage('study context', [
      { sender: 'user', text: 'How are you?' }
    ]);

    expect(globalThis.fetch).toHaveBeenCalled();
    expect(result).toBe('Hello, this is a response from Gemini!');
  });
});

describe('extractGrammarNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockStorage();
  });

  it('should return null if API key is not configured', async () => {
    const result = await extractGrammarNote('some explanation');
    expect(result).toBeNull();
  });

  it('should call Gemini API, clean code blocks, and return structured grammar object', async () => {
    await saveSettings({
      ai_provider: 'gemini',
      gemini_api_key: 'fake_gemini_key_abc',
      gemini_model: 'gemini-2.5-flash-lite'
    });

    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '```json\n{\n  "title": "Neither... nor",\n  "content": "Dùng để diễn tả phủ định cả hai",\n  "example": "Neither John nor Mary came.",\n  "tags": ["conjunction"]\n}\n```'
              }
            ]
          }
        }
      ]
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const result = await extractGrammarNote('explanation of neither nor');

    expect(globalThis.fetch).toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Neither... nor');
    expect(result?.content).toBe('Dùng để diễn tả phủ định cả hai');
    expect(result?.example).toBe('Neither John nor Mary came.');
    expect(result?.tags).toEqual(['conjunction']);
  });
});

describe('Translator API (OpenAI and Ollama)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    clearMockStorage();
  });

  it('should call OpenAI API if openai is configured with api_key auth type', async () => {
    await saveSettings({
      ai_provider: 'openai',
      openai_auth_type: 'api_key',
      openai_api_key: 'fake_openai_key'
    });

    const openaiMockResponse = {
      choices: [{ message: { content: 'Đây là bản dịch OpenAI.' } }]
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => openaiMockResponse
    });

    const result = await translateSentenceWithAI('This is a sentence.');
    expect(result).toBe('Đây là bản dịch OpenAI.');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer fake_openai_key'
        })
      })
    );
  });

  it('should call the ChatGPT companion when selected under OpenAI', async () => {
    await saveSettings({
      ai_provider: 'openai',
      openai_auth_type: 'chatgpt_web',
      chatgpt_access_token: 'fake_oauth_chatgpt_token'
    });

    const sendMessage = mockChatGPTCompanion('Bản dịch từ ChatGPT.');

    const result = await translateSentenceWithAI('Hello OpenAI via ChatGPT OAuth');
    expect(result).toBe('Bản dịch từ ChatGPT.');
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CHATGPT_COMPANION_REQUEST',
        path: '/response',
        body: expect.objectContaining({ model: 'gpt-6.1-sol' })
      })
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('should call Ollama API if ollama is configured', async () => {
    await saveSettings({
      ai_provider: 'ollama',
      ollama_url: 'http://localhost:11434'
    });

    const ollamaTagsResponse = {
      models: [{ name: 'llama3:latest' }]
    };

    const ollamaChatResponse = {
      choices: [{ message: { content: 'Đây là bản dịch Ollama.' } }]
    };

    (globalThis.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/tags')) {
        return Promise.resolve({ ok: true, json: async () => ollamaTagsResponse });
      }
      if (url.includes('/v1/chat/completions')) {
        return Promise.resolve({ ok: true, json: async () => ollamaChatResponse });
      }
      return Promise.resolve({ ok: false });
    });

    const result = await translateSentenceWithAI('This is a sentence.');
    expect(result).toBe('Đây là bản dịch Ollama.');
  });

  it('should ignore a stale website token and use the companion', async () => {
    await saveSettings({
      ai_provider: 'chatgpt_web',
      chatgpt_access_token: 'chatgpt_fake_session_token'
    });

    const sendMessage = mockChatGPTCompanion('Bản dịch từ ChatGPT.');

    const result = await translateSentenceWithAI('Hello world');
    expect(result).toBe('Bản dịch từ ChatGPT.');
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CHATGPT_COMPANION_REQUEST'
      })
    );
  });

  it('should use the companion without a website token', async () => {
    await saveSettings({
      ai_provider: 'chatgpt_web',
      chatgpt_access_token: ''
    });

    mockChatGPTCompanion('Dịch tự động qua ChatGPT.');

    const result = await translateSentenceWithAI('Testing auto fetch token');
    expect(result).toBe('Dịch tự động qua ChatGPT.');
  });

  it('should show an actionable companion error', async () => {
    await saveSettings({ ai_provider: 'chatgpt_web', chatgpt_access_token: '' });
    const sendMessage = vi.fn(async () => ({ error: 'Please sign in with ChatGPT' }));
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => ({ chatgpt_pairing_code: 'test-pairing-code-of-adequate-length' })) } },
      runtime: { sendMessage }
    });

    const result = await translateSentenceWithAI('Hello');
    expect(result).toContain('Please sign in with ChatGPT');
  });

  it('should return appropriate provider warnings when config is missing', async () => {
    await saveSettings({
      ai_provider: 'openai',
      openai_auth_type: 'api_key',
      openai_api_key: ''
    });
    let result = await translateSentenceWithAI('This is a sentence.');
    expect(result).toContain('Vui lòng cấu hình OpenAI API Key');

    await saveSettings({
      ai_provider: 'ollama',
      ollama_url: ''
    });
    result = await translateSentenceWithAI('This is a sentence.');
    expect(result).toContain('Vui lòng cấu hình Ollama URL');
  });
});

describe('testAIConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockStorage();
  });

  it('should return error if no provider is selected', async () => {
    await saveSettings({ ai_provider: 'none' });
    const result = await testAIConnection();
    expect(result.success).toBe(false);
    expect(result.message).toContain('Chưa chọn nhà cung cấp AI');
  });

  it('should return error if API key is missing', async () => {
    await saveSettings({ ai_provider: 'gemini', gemini_api_key: '' });
    const result = await testAIConnection();
    expect(result.success).toBe(false);
    expect(result.message).toContain('Vui lòng cấu hình Gemini API Key');
  });

  it('should return success when AI returns valid response', async () => {
    await saveSettings({
      ai_provider: 'gemini',
      gemini_api_key: 'valid_key',
      gemini_model: 'gemini-2.5-flash-lite'
    });

    const geminiMockResponse = {
      candidates: [{ content: { parts: [{ text: 'OK: Kết nối AI hoạt động tốt' }] } }]
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => geminiMockResponse
    });

    const result = await testAIConnection();
    expect(result.success).toBe(true);
    expect(result.model).toBe('gemini-2.5-flash-lite');
    expect(result.sampleResponse).toBe('OK: Kết nối AI hoạt động tốt');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should support testing custom unsaved settings', async () => {
    const geminiMockResponse = {
      candidates: [{ content: { parts: [{ text: 'Hello from custom settings' }] } }]
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => geminiMockResponse
    });

    const result = await testAIConnection({
      ai_provider: 'gemini',
      gemini_api_key: 'unsaved_form_key',
      gemini_model: 'gemini-3.1-flash-lite'
    });

    expect(result.success).toBe(true);
    expect(result.model).toBe('gemini-3.1-flash-lite');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('gemini-3.1-flash-lite'),
      expect.any(Object)
    );
  });

  it('should handle API failure gracefully', async () => {
    await saveSettings({
      ai_provider: 'openai',
      openai_auth_type: 'api_key',
      openai_api_key: 'invalid_key'
    });

    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'Incorrect API key provided' } })
    });

    const result = await testAIConnection();
    expect(result.success).toBe(false);
    expect(result.message).toContain('Incorrect API key provided');
  });

  it('should support DeepSeek API Key correctly', async () => {
    await saveSettings({
      ai_provider: 'deepseek',
      deepseek_auth_type: 'api_key',
      deepseek_api_key: 'sk-deepseek-test-key',
      deepseek_model: 'deepseek-chat'
    });

    const deepseekMockResponse = {
      choices: [{ message: { content: 'DeepSeek is ready!' } }]
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => deepseekMockResponse
    });

    const result = await testAIConnection();
    expect(result.success).toBe(true);
    expect(result.model).toContain('deepseek-chat');
    expect(result.sampleResponse).toBe('DeepSeek is ready!');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-deepseek-test-key'
        })
      })
    );
  });

  it('should support DeepSeek Web Token correctly', async () => {
    await saveSettings({
      ai_provider: 'deepseek',
      deepseek_auth_type: 'web_token',
      deepseek_web_token: 'web_token_abc123',
      deepseek_model: 'deepseek-reasoner'
    });

    (globalThis.fetch as any).mockImplementation(async (url: string) => {
      if (url.includes('chat_session/create')) {
        return {
          ok: true,
          json: async () => ({
            code: 0,
            data: { biz_data: { id: 'session-id-123' } }
          })
        };
      }
      if (url.includes('chat/completion')) {
        return {
          ok: true,
          text: async () => `data: {"choices":[{"delta":{"content":"DeepSeek R1 web response"}}]}\ndata: [DONE]`
        };
      }
      return { ok: false };
    });

    const result = await testAIConnection();
    expect(result.success).toBe(true);
    expect(result.model).toContain('deepseek-reasoner');
    expect(result.sampleResponse).toBe('DeepSeek R1 web response');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://chat.deepseek.com/api/v0/chat/completion',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer web_token_abc123'
        }),
        body: expect.stringContaining('"chat_session_id":"session-id-123"')
      })
    );
  });

  it('should support DeepSeek Local Proxy correctly', async () => {
    await saveSettings({
      ai_provider: 'deepseek',
      deepseek_auth_type: 'local_proxy',
      deepseek_proxy_url: 'http://127.0.0.1:9655',
      deepseek_model: 'deepseek-chat'
    });

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'OK from FreeDeepseekAPI' } }]
      })
    });

    const result = await testAIConnection();
    expect(result.success).toBe(true);
    expect(result.model).toContain('FreeDeepseekAPI Proxy');
    expect(result.sampleResponse).toBe('OK from FreeDeepseekAPI');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9655/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        })
      })
    );
  });

  describe('searchGrammarWithAI', () => {
    it('should throw error when AI provider is none', async () => {
      await saveSettings({ ai_provider: 'none' });
      await expect(searchGrammarWithAI('Third Conditional')).rejects.toThrow();
    });

    it('should query DeepSeek local proxy and parse structured grammar explanation', async () => {
      await saveSettings({
        ai_provider: 'deepseek',
        deepseek_auth_type: 'local_proxy',
        deepseek_proxy_url: 'http://127.0.0.1:9655',
        deepseek_model: 'deepseek-chat'
      });

      const mockResponse = JSON.stringify({
        title: 'Third Conditional (Câu điều kiện loại 3)',
        formula: 'If + S + had + V3/ed, S + would + have + V3/ed',
        explanation: 'Diễn tả hành động không có thật trong quá khứ.',
        examples: [
          { english: 'If I had studied harder, I would have passed.', vietnamese: 'Nếu tôi đã học chăm hơn, tôi đã đỗ rồi.' }
        ],
        notes: 'Đảo ngữ: Had + S + V3/ed...',
        tags: ['conditional', 'advanced']
      });

      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({
          choices: [{ message: { content: mockResponse } }]
        })
      });

      const res = await searchGrammarWithAI('Conditional 3');
      expect(res.title).toBe('Third Conditional (Câu điều kiện loại 3)');
      expect(res.formula).toBe('If + S + had + V3/ed, S + would + have + V3/ed');
      expect(res.explanation).toContain('quá khứ');
      expect(res.examples).toHaveLength(1);
      expect(res.tags).toEqual(['conditional', 'advanced']);
    });
  });

  describe('generateVocabularyByTopicWithAI', () => {
    it('should generate vocabulary list by topic', async () => {
      await saveSettings({
        ai_provider: 'deepseek',
        deepseek_auth_type: 'local_proxy',
        deepseek_proxy_url: 'http://127.0.0.1:9655'
      });

      const mockWords = JSON.stringify({
        words: [
          {
            word: 'pipeline',
            phonetic: '/ˈpaɪp.laɪn/',
            meaning: 'đường ống dẫn dữ liệu',
            description: '[noun] chuỗi quy trình xử lý',
            example: 'We built a data pipeline in Python.',
            tags: ['data-engineering']
          }
        ]
      });

      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({
          choices: [{ message: { content: mockWords } }]
        })
      });

      const words = await generateVocabularyByTopicWithAI('Data Engineering', 1, 'B2');
      expect(words).toHaveLength(1);
      expect(words[0].word).toBe('pipeline');
      expect(words[0].meaning).toBe('đường ống dẫn dữ liệu');
    });
  });

  describe('getAIDailyInsight', () => {
    it('should return daily insight correctly', async () => {
      await saveSettings({
        ai_provider: 'deepseek',
        deepseek_auth_type: 'local_proxy',
        deepseek_proxy_url: 'http://127.0.0.1:9655'
      });

      const mockInsight = JSON.stringify({
        greeting: 'Chào bạn!',
        tip: 'Mỗi ngày học 5 từ vựng mới.',
        recommendedFocus: 'Ôn tập thì quá khứ.',
        example: 'Practice makes perfect.'
      });

      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({
          choices: [{ message: { content: mockInsight } }]
        })
      });

      const insight = await getAIDailyInsight({ totalWords: 10, missedWords: [], masteredWordsCount: 2 });
      expect(insight.greeting).toBe('Chào bạn!');
      expect(insight.tip).toContain('học 5 từ');
    });
  });
});
