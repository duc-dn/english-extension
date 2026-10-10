import { describe, expect, it } from 'vitest';
import { buildVocabularyCsv, parseVocabularyCsv } from './vocabularyCsv';
import type { Word } from './db';

describe('vocabulary CSV', () => {
  it('round trips commas, quotes, line breaks, unicode and tags', () => {
    const word: Word = {
      id: '1', word: 'take off', meaning: 'cất cánh, "bay lên"',
      phonetic: '/teɪk ɔːf/', example: 'The plane\ntook off.',
      description: 'cụm động từ', tags: ['travel', 'verb'],
      created_at: new Date(), next_review: new Date(), review_level: 0
    };
    const result = parseVocabularyCsv(buildVocabularyCsv([word]));
    expect(result).toEqual({
      skipped: 0,
      words: [{
        word: word.word, meaning: word.meaning, phonetic: word.phonetic,
        example: word.example, description: word.description, tags: word.tags
      }]
    });
  });

  it('skips incomplete rows and rejects a missing header', () => {
    expect(parseVocabularyCsv('word,meaning\nhello,xin chào\nempty,\n').skipped).toBe(1);
    expect(() => parseVocabularyCsv('term,translation\nhello,xin chào')).toThrow();
  });

  it('escapes spreadsheet formulas in exported cells', () => {
    const word: Word = {
      id: '1', word: '=1+1', meaning: 'formula', example: '', tags: [],
      created_at: new Date(), next_review: new Date(), review_level: 0
    };
    const csv = buildVocabularyCsv([word]);
    expect(csv).toContain("\"'=1+1\"");
    expect(parseVocabularyCsv(csv).words[0].word).toBe('=1+1');
  });
});
