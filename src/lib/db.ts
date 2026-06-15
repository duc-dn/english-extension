import Dexie from 'dexie';
import type { Table } from 'dexie';

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

export async function addWord(word: Omit<Word, 'id' | 'created_at' | 'review_level' | 'next_review'>) {
  const newWord: Word = {
    ...word,
    phonetic: word.phonetic || '',
    id: crypto.randomUUID(),
    review_level: 0,
    next_review: new Date(), // Due immediately
    created_at: new Date(),
    wrong_count: 0,
    status: 'new'
  };
  await db.words.add(newWord);
  triggerAutoSync();
  return newWord;
}

export async function getWordsToReview(tag?: string, includeMastered: boolean = false) {
  let query = db.words.where('next_review').belowOrEqual(new Date());
  
  const words = await query.toArray();
  
  const filteredWords = includeMastered
    ? words
    : words.filter(w => (w.status || 'new') !== 'mastered');
  
  if (tag && tag !== 'all') {
    return filteredWords.filter(w => (w.tags || []).includes(tag));
  }
  return filteredWords;
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
  await db.words.delete(id);
  triggerAutoSync();
}

export async function updateWord(id: string, updates: Partial<Omit<Word, 'id' | 'created_at'>>) {
  await db.words.update(id, updates);
  triggerAutoSync();
}

// --- Spaced Repetition System (SRS) ---

export async function updateWordReview(id: string, score: 'again' | 'hard' | 'good' | 'easy') {
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

  // Calculate next interval based on new level
  let daysToAdd = 0;
  switch (newLevel) {
    case 0: daysToAdd = 0; break;
    case 1: daysToAdd = 1; break;
    case 2: daysToAdd = 3; break;
    case 3: daysToAdd = 7; break;
    case 4: daysToAdd = 14; break;
    case 5: daysToAdd = 30; break;
    default: daysToAdd = 90; break; // Level 6+
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + daysToAdd);

  let newStatus: 'new' | 'learning' | 'reviewing' | 'mastered' = 'new';
  if (newLevel === 0) {
    newStatus = 'new';
  } else if (newLevel <= 2) {
    newStatus = 'learning';
  } else if (newLevel <= 4) {
    newStatus = 'reviewing';
  } else {
    newStatus = 'mastered';
  }

  await db.words.update(id, {
    review_level: newLevel,
    next_review: nextReview,
    status: newStatus
  });

  // Save review history
  await db.review_history.add({
    id: crypto.randomUUID(),
    word_id: id,
    reviewed_at: new Date(),
    score
  });

  triggerAutoSync();
  return { oldStatus, newStatus };
}

export async function incrementWrongCount(id: string) {
  const word = await db.words.get(id);
  if (word) {
    await db.words.update(id, { wrong_count: (word.wrong_count || 0) + 1 });
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
    chrome.runtime.sendMessage({ action: 'SYNC_GITHUB' }, () => {
      if (chrome.runtime.lastError) {
        console.warn('Auto-sync message failed:', chrome.runtime.lastError);
      }
    });
  } else {
    try {
      const { syncToGithub } = await import('./github');
      await syncToGithub();
    } catch (e) {
      // Ignore sync failures in dev/test environment
    }
  }
}
