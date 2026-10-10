import Dexie from 'dexie';
import type { Table } from 'dexie';
import { getSettings } from './settings';

export interface Word {
  id: string;
  word: string;
  phonetic?: string;
  meaning: string;
  example: string;
  tags: string[];
  created_at: Date;
  review_level: number;
  next_review: Date;
  wrong_count?: number;
  status?: 'new' | 'learning' | 'reviewing' | 'mastered';
  description?: string;
  contextSentence?: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

export interface GrammarNote {
  id: string;
  title: string;
  content: string;
  example: string;
  tags: string[];
  review_level: number;
  next_review: Date;
  created_at: Date;
}

export interface ReviewHistory {
  id: string;
  word_id: string;
  score: "again" | "hard" | "good" | "easy";
  reviewed_at: Date;
}

export class EnglishExtensionDB extends Dexie {
  words!: Table<Word, string>;
  grammar_notes!: Table<GrammarNote, string>;
  review_history!: Table<ReviewHistory, string>;

  constructor() {
    super('EnglishExtensionDB');
    this.version(1).stores({
      words: 'id, word, *tags, next_review, created_at',
      grammar_notes: 'id, title, *tags, next_review, created_at',
      review_history: 'id, item_id, result, reviewed_at'
    });
    this.version(2).stores({
      words: 'id, word, *tags, created_at, next_review, wrong_count',
      review_history: 'id, word_id, reviewed_at, score',
      grammar_notes: 'id, title, created_at'
    });
    this.version(3).stores({
      words: 'id, word, *tags, created_at, next_review, wrong_count, status',
      review_history: 'id, word_id, reviewed_at, score',
      grammar_notes: 'id, title, created_at'
    });
  }
}

export const db = new EnglishExtensionDB();

// --- Helper Functions for Words ---

export type WordInput = Pick<Word, 'word' | 'meaning' | 'example' | 'tags'> &
  Partial<Pick<Word, 'phonetic' | 'description' | 'contextSentence' | 'sourceUrl' | 'sourceTitle'>>;

const normalizeWord = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export class DuplicateWordError extends Error {
  constructor() {
    super('This word is already in your vocabulary.');
    this.name = 'DuplicateWordError';
  }
}

function createWord(input: WordInput): Word {
  return {
    ...input,
    word: input.word.trim().replace(/\s+/g, ' '),
    meaning: input.meaning.trim(),
    phonetic: input.phonetic?.trim() || '',
    description: input.description?.trim() || '',
    example: input.example?.trim() || '',
    contextSentence: input.contextSentence?.trim() || input.example?.trim() || '',
    sourceUrl: input.sourceUrl?.trim() || '',
    sourceTitle: input.sourceTitle?.trim() || '',
    tags: [...new Set(input.tags.map(tag => tag.trim()).filter(Boolean))],
    id: crypto.randomUUID(),
    review_level: 0,
    next_review: new Date(),
    created_at: new Date(),
    wrong_count: 0,
    status: 'new'
  };
}

export async function addWord(input: WordInput) {
  const newWord = createWord(input);
  if (!newWord.word || !newWord.meaning) throw new Error('Word and meaning are required.');
  await db.transaction('rw', db.words, async () => {
    const existing = await db.words.filter(word => normalizeWord(word.word) === normalizeWord(newWord.word)).first();
    if (existing) throw new DuplicateWordError();
    await db.words.add(newWord);
  });
  triggerAutoSync();
  return newWord;
}

export async function getWordsToReview(tag?: string) {
  const words = await db.words.where('next_review').belowOrEqual(new Date()).toArray();
  if (tag && tag !== 'all') {
    return words.filter(w => (w.tags || []).includes(tag));
  }
  return words;
}

export async function getAllTags(): Promise<string[]> {
  const words = await db.words.toArray();
  const tags = new Set<string>();
  words.forEach(w => (w.tags || []).forEach(t => tags.add(t)));
  return Array.from(tags).sort();
}

export async function getWordsByTag(tag: string) {
  return await db.words
    .where('tags')
    .equals(tag)
    .toArray();
}

export async function deleteWord(id: string) {
  await db.transaction('rw', db.words, db.review_history, async () => {
    await db.words.delete(id);
    await db.review_history.where('word_id').equals(id).delete();
  });
  triggerAutoSync();
}

export async function updateWord(id: string, updates: Partial<Omit<Word, 'id' | 'created_at'>>) {
  await db.transaction('rw', db.words, async () => {
    if (updates.word !== undefined) {
      updates.word = updates.word.trim().replace(/\s+/g, ' ');
      if (!updates.word) throw new Error('Word is required.');
      const existing = await db.words.filter(word => word.id !== id && normalizeWord(word.word) === normalizeWord(updates.word!)).first();
      if (existing) throw new DuplicateWordError();
    }
    await db.words.update(id, updates);
  });
  triggerAutoSync();
}

export async function importWords(inputs: WordInput[]): Promise<{ added: number; duplicates: number }> {
  let added = 0;
  let duplicates = 0;
  await db.transaction('rw', db.words, async () => {
    const existing = new Set((await db.words.toArray()).map(word => normalizeWord(word.word)));
    const pending: Word[] = [];
    for (const input of inputs) {
      const word = createWord(input);
      const key = normalizeWord(word.word);
      if (!key || !word.meaning) continue;
      if (existing.has(key)) {
        duplicates++;
        continue;
      }
      pending.push(word);
      existing.add(key);
      added++;
    }
    if (pending.length) await db.words.bulkAdd(pending);
  });
  if (added) triggerAutoSync();
  return { added, duplicates };
}

// --- Spaced Repetition System (SRS) ---

export type ReviewScore = 'again' | 'hard' | 'good' | 'easy';

const intervalDays = [0, 1, 3, 7, 14, 30, 90];

export function getReviewIntervalMinutes(level: number, score: ReviewScore): number {
  if (score === 'again') return 10;
  if (score === 'hard') return level === 0 ? 60 : Math.max(60, (intervalDays[Math.min(level, 6)] * 24 * 60) / 2);
  const nextLevel = level + (score === 'easy' ? 2 : 1);
  return intervalDays[Math.min(nextLevel, 6)] * 24 * 60;
}

export async function updateWordReview(id: string, score: ReviewScore) {
  const word = await db.words.get(id);
  if (!word) return { oldStatus: 'new' as const, newStatus: 'new' as const };

  const oldStatus = word.status || 'new';
  let newLevel = word.review_level;
  
  if (score === 'again') {
    newLevel = 0;
  } else if (score === 'hard') {
    newLevel = Math.max(0, newLevel);
  } else if (score === 'good') {
    newLevel += 1;
  } else if (score === 'easy') {
    newLevel += 2;
  }

  const nextReview = new Date(Date.now() + getReviewIntervalMinutes(word.review_level, score) * 60_000);

  let newStatus: 'new' | 'learning' | 'reviewing' | 'mastered';
  if (newLevel <= 2) {
    newStatus = 'learning';
  } else if (newLevel <= 4) {
    newStatus = 'reviewing';
  } else {
    newStatus = 'mastered';
  }

  await db.transaction('rw', db.words, db.review_history, async () => {
    await db.words.update(id, {
      review_level: newLevel,
      next_review: nextReview,
      status: newStatus
    });
    await db.review_history.add({
      id: crypto.randomUUID(),
      word_id: id,
      reviewed_at: new Date(),
      score
    });
  });

  triggerAutoSync();
  return { oldStatus, newStatus };
}

export async function incrementWrongCount(id: string) {
  const word = await db.words.get(id);
  if (word) {
    await db.words.update(id, {
      wrong_count: (word.wrong_count || 0) + 1,
      review_level: 0,
      status: 'learning',
      next_review: new Date(Date.now() + getReviewIntervalMinutes(word.review_level, 'again') * 60_000)
    });
    triggerAutoSync();
  }
}

export async function getFrequentlyMissedWords(limit: number = 5) {
  const words = await db.words.toArray();
  return words
    .filter(w => (w.wrong_count || 0) > 0)
    .sort((a, b) => (b.wrong_count || 0) - (a.wrong_count || 0))
    .slice(0, limit);
}

export async function getWordsByStatus(status: 'new' | 'learning' | 'reviewing' | 'mastered') {
  const words = await db.words.toArray();
  return words.filter(w => (w.status || 'new') === status);
}

export async function getMasteryStats() {
  const words = await db.words.toArray();
  const stats = {
    new: 0,
    learning: 0,
    reviewing: 0,
    mastered: 0,
    total: words.length
  };
  words.forEach(w => {
    const status = w.status || 'new';
    if (status === 'new') stats.new++;
    else if (status === 'learning') stats.learning++;
    else if (status === 'reviewing') stats.reviewing++;
    else if (status === 'mastered') stats.mastered++;
  });
  return stats;
}

export async function addGrammarNote(note: Omit<GrammarNote, 'id' | 'created_at' | 'review_level' | 'next_review'>) {
  const newNote: GrammarNote = {
    ...note,
    id: crypto.randomUUID(),
    review_level: 0,
    next_review: new Date(),
    created_at: new Date()
  };
  await db.grammar_notes.add(newNote);
  triggerAutoSync();
  return newNote;
}

export async function deleteGrammarNote(id: string) {
  await db.grammar_notes.delete(id);
  triggerAutoSync();
}

async function triggerAutoSync() {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    const settings = await getSettings();
    if (!settings.github_repo || !settings.github_token) return;
    chrome.runtime.sendMessage({ action: 'SYNC_GITHUB' }, () => {
      if (chrome.runtime.lastError) {
        console.warn('Auto-sync message failed:', chrome.runtime.lastError);
      }
    });
  }
}
