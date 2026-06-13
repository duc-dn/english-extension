import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, addWord, getWordsToReview, getWordsByTag, deleteWord } from './db';

describe('English Extension DB (Dexie)', () => {
  beforeEach(async () => {
    // Clear all tables before each test
    await db.words.clear();
    await db.grammar_notes.clear();
    await db.review_history.clear();
  });

  it('should add a new word correctly', async () => {
    const newWord = await addWord({
      word: 'implement',
      meaning: 'triển khai',
      example: 'We implement the code.',
      tags: ['it', 'verb']
    });

    expect(newWord.id).toBeDefined();
    expect(newWord.word).toBe('implement');
    expect(newWord.review_level).toBe(0);
    expect(newWord.next_review).toBeInstanceOf(Date);
    
    const count = await db.words.count();
    expect(count).toBe(1);
  });

  it('should retrieve words by tag', async () => {
    await addWord({ word: 'deploy', meaning: 'triển khai', example: '', tags: ['it', 'devops'] });
    await addWord({ word: 'apple', meaning: 'quả táo', example: '', tags: ['fruit'] });

    const itWords = await getWordsByTag('it');
    expect(itWords.length).toBe(1);
    expect(itWords[0].word).toBe('deploy');

    const fruitWords = await getWordsByTag('fruit');
    expect(fruitWords.length).toBe(1);
    expect(fruitWords[0].word).toBe('apple');
  });

  it('should fetch words that are due for review today (SRS)', async () => {
    // Word 1: Due yesterday (should be fetched)
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    await db.words.add({
      id: '1', word: 'past', meaning: '', example: '', tags: [],
      review_level: 1, next_review: pastDate, created_at: new Date()
    });

    // Word 2: Due tomorrow (should NOT be fetched)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    await db.words.add({
      id: '2', word: 'future', meaning: '', example: '', tags: [],
      review_level: 1, next_review: futureDate, created_at: new Date()
    });

    // Word 3: Due exactly now (should be fetched)
    await db.words.add({
      id: '3', word: 'now', meaning: '', example: '', tags: [],
      review_level: 1, next_review: new Date(), created_at: new Date()
    });

    const dueWords = await getWordsToReview();
    expect(dueWords.length).toBe(2);
    
    const fetchedWords = dueWords.map(w => w.word);
    expect(fetchedWords).toContain('past');
    expect(fetchedWords).toContain('now');
    expect(fetchedWords).not.toContain('future');
  });

  it('should delete a word correctly', async () => {
    const word = await addWord({ word: 'delete-me', meaning: '', example: '', tags: [] });
    
    let count = await db.words.count();
    expect(count).toBe(1);

    await deleteWord(word.id);

    count = await db.words.count();
    expect(count).toBe(0);
  });
});
