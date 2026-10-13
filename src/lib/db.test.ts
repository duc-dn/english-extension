import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, addWord, getWordsToReview, getWordsByTag, deleteWord, updateWord, updateWordReview, incrementWrongCount, importWords, DuplicateWordError, getReviewIntervalMinutes, getLearningWords, markWordMastered } from './db';

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
    const word = await addWord({ word: 'delete-me', meaning: 'xóa', example: '', tags: [] });
    await updateWordReview(word.id, 'good');
    
    let count = await db.words.count();
    expect(count).toBe(1);

    await deleteWord(word.id);

    count = await db.words.count();
    expect(count).toBe(0);
    expect(await db.review_history.count()).toBe(0);
  });

  it('prevents duplicate words regardless of case and spaces', async () => {
    await addWord({ word: '  Take   off ', meaning: 'cất cánh', example: '', tags: [] });
    const another = await addWord({ word: 'land', meaning: 'hạ cánh', example: '', tags: [] });
    await expect(addWord({ word: 'take off', meaning: 'cởi ra', example: '', tags: [] }))
      .rejects.toBeInstanceOf(DuplicateWordError);
    await expect(updateWord(another.id, { word: 'TAKE OFF' })).rejects.toBeInstanceOf(DuplicateWordError);
    expect(await db.words.count()).toBe(2);
  });

  it('imports only new words and keeps existing review progress', async () => {
    const existing = await addWord({ word: 'apple', meaning: 'táo', example: '', tags: [] });
    await updateWordReview(existing.id, 'good');
    const result = await importWords([
      { word: 'APPLE', meaning: 'quả táo', example: '', tags: [] },
      { word: 'pear', meaning: 'lê', example: '', tags: ['fruit'] },
      { word: ' Pear ', meaning: 'lê', example: '', tags: [] }
    ]);
    expect(result).toEqual({ added: 1, duplicates: 2 });
    expect((await db.words.get(existing.id))?.review_level).toBe(1);
  });

  it('returns mastered words when their review date arrives', async () => {
    const word = await addWord({ word: 'mastered', meaning: 'đã thuộc', example: '', tags: [] });
    await db.words.update(word.id, { status: 'mastered', review_level: 5, next_review: new Date(Date.now() - 1000) });
    expect((await getWordsToReview()).map(item => item.id)).toContain(word.id);
  });

  it('schedules mistakes for later review and quiz misses reset progress', async () => {
    const word = await addWord({ word: 'recover', meaning: 'hồi phục', example: '', tags: [] });
    const before = Date.now();
    await updateWordReview(word.id, 'again');
    let updated = await db.words.get(word.id);
    expect(updated?.status).toBe('learning');
    expect(updated!.next_review.getTime()).toBeGreaterThanOrEqual(before + 10 * 60_000);
    expect(updated!.next_review.getTime()).toBeLessThan(before + 10 * 60_000 + 5000);

    await updateWordReview(word.id, 'easy');
    await incrementWrongCount(word.id);
    updated = await db.words.get(word.id);
    expect(updated?.wrong_count).toBe(1);
    expect(updated?.review_level).toBe(0);
    expect(updated?.status).toBe('learning');
    expect(updated!.next_review.getTime()).toBeGreaterThan(Date.now());
  });

  it('shows the same review intervals that are scheduled', () => {
    expect(getReviewIntervalMinutes(0, 'again')).toBe(10);
    expect(getReviewIntervalMinutes(0, 'hard')).toBe(60);
    expect(getReviewIntervalMinutes(0, 'good')).toBe(1440);
    expect(getReviewIntervalMinutes(0, 'easy')).toBe(3 * 1440);
  });

  it('fetches learning words and marks a word as mastered', async () => {
    const w1 = await addWord({ word: 'collaborate', meaning: 'hợp tác', example: '', tags: [] });
    await addWord({ word: 'achieve', meaning: 'đạt được', example: '', tags: [] });

    let learning = await getLearningWords();
    expect(learning.length).toBe(2);

    await markWordMastered(w1.id);
    learning = await getLearningWords();
    expect(learning.length).toBe(1);
    expect(learning[0].word).toBe('achieve');

    const updatedW1 = await db.words.get(w1.id);
    expect(updatedW1?.status).toBe('mastered');
  });
});
