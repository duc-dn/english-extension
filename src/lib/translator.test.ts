import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBasicMeaning, sendChatMessage, extractGrammarNote } from './translator';
import { saveSettings, clearMockStorage } from './settings';

// Mock the global fetch function
globalThis.fetch = vi.fn();

describe('Translator API (Free Dictionary)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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


