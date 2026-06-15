import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBasicMeaning, translateSentenceWithAI, sendChatMessage, extractGrammarNote } from './translator';
import { saveSettings, clearMockStorage } from './settings';

// Mock the global fetch function
globalThis.fetch = vi.fn();

describe('Translator API (Free Dictionary)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockStorage();
  });

  it('should fetch meaning successfully for a valid word', async () => {
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

    const result = await fetchBasicMeaning('implement');
    
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

    const result = await fetchBasicMeaning('invalidwordthatdoesnotexist');
    
    expect(result).toBeNull();
  });

  it('should fallback to MyMemory and NOT call Gemini for basic meaning even if gemini is configured', async () => {
    await saveSettings({
      ai_provider: 'gemini',
      gemini_api_key: 'fake_key'
    });

    const dictMockResponse = [{ word: 'implement', meanings: [] }];
    const myMemoryMockResponse = {
      responseData: { translatedText: 'thực thi' }
    };

    (globalThis.fetch as any).mockImplementation((url: string) => {
      if (url.includes('dictionaryapi.dev')) {
        return Promise.resolve({ ok: true, json: async () => dictMockResponse });
      }
      if (url.includes('mymemory.translated.net')) {
        return Promise.resolve({ ok: true, json: async () => myMemoryMockResponse });
      }
      return Promise.resolve({ ok: false });
    });

    const result = await fetchBasicMeaning('implement');
    expect(result?.vietnameseMeaning).toBe('thực thi');
    
    // Ensure gemini googleapis.com was not called
    const fetchCalls = (globalThis.fetch as any).mock.calls;
    const calledGoogleApi = fetchCalls.some(([url]: [string]) => url.includes('googleapis.com'));
    expect(calledGoogleApi).toBe(false);
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
    clearMockStorage();
  });

  it('should call OpenAI API if openai is configured', async () => {
    await saveSettings({
      ai_provider: 'openai',
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

  it('should return appropriate provider warnings when config is missing', async () => {
    await saveSettings({
      ai_provider: 'openai',
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


