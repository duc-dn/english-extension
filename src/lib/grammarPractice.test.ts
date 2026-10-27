import { describe, expect, it } from 'vitest';
import type { GrammarNote } from './db';
import { getGrammarAnswerUpdate, getGrammarMistakeCount, isGrammarReviewDue } from './grammarPractice';

const makeNote = (overrides: Partial<GrammarNote> = {}): GrammarNote => ({
  id: 'note-1',
  title: 'Third conditional',
  content: 'If + past perfect',
  example: '',
  tags: [],
  review_level: 0,
  next_review: new Date('2026-10-26T00:00:00Z'),
  created_at: new Date('2026-10-25T00:00:00Z'),
  exercises: { multipleChoice: [{ id: 'q1', question: 'Test', options: ['A', 'B'], correctAnswer: 0, explanation: '' }] },
  ...overrides
});

describe('grammar practice', () => {
  it('keeps missed questions for review and clears them after a correct answer', () => {
    const now = new Date('2026-10-26T10:00:00Z');
    const wrong = getGrammarAnswerUpdate(makeNote(), 'q1', false, now);
    expect(wrong.quiz_mistake_ids).toEqual(['q1']);
    expect(wrong.review_level).toBe(0);
    expect(getGrammarMistakeCount(makeNote(wrong))).toBe(1);

    const corrected = getGrammarAnswerUpdate(makeNote(wrong), 'q1', true, now);
    expect(corrected.quiz_mistake_ids).toEqual([]);
    expect(corrected.quiz_attempts).toBe(2);
    expect(corrected.quiz_correct).toBe(1);
    expect(corrected.review_level).toBe(1);
  });

  it('counts only current questions and never marks untouched notes due', () => {
    const now = new Date('2026-10-26T10:00:00Z');
    const note = makeNote({ quiz_mistake_ids: ['deleted-question', 'q1'] });
    expect(getGrammarMistakeCount(note)).toBe(1);
    expect(isGrammarReviewDue(note, now)).toBe(false);
    expect(isGrammarReviewDue(makeNote({ last_practiced_at: new Date('2026-10-25T10:00:00Z') }), now)).toBe(true);
  });
});
