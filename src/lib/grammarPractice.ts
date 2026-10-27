import type { GrammarNote } from './db';

const REVIEW_DAYS = [1, 3, 7, 14, 30];

export function isGrammarReviewDue(note: GrammarNote, now = new Date()): boolean {
  return Boolean(note.last_practiced_at && note.exercises?.multipleChoice?.length) && new Date(note.next_review).getTime() <= now.getTime();
}

export function getGrammarMistakeCount(note: GrammarNote): number {
  const availableIds = new Set((note.exercises?.multipleChoice || []).map(question => question.id));
  return (note.quiz_mistake_ids || []).filter(id => availableIds.has(id)).length;
}

export function getGrammarAnswerUpdate(
  note: GrammarNote,
  questionId: string,
  correct: boolean,
  now = new Date()
): Pick<GrammarNote, 'quiz_mistake_ids' | 'quiz_attempts' | 'quiz_correct' | 'review_level' | 'next_review' | 'last_practiced_at'> {
  const availableIds = new Set((note.exercises?.multipleChoice || []).map(question => question.id));
  const mistakeIds = new Set((note.quiz_mistake_ids || []).filter(id => availableIds.has(id)));
  if (correct) mistakeIds.delete(questionId);
  else mistakeIds.add(questionId);

  const reviewLevel = correct && mistakeIds.size === 0 ? Math.min((note.review_level || 0) + 1, REVIEW_DAYS.length) : 0;
  const nextReview = new Date(now);
  nextReview.setDate(nextReview.getDate() + REVIEW_DAYS[Math.max(0, reviewLevel - 1)]);

  return {
    quiz_mistake_ids: [...mistakeIds],
    quiz_attempts: (note.quiz_attempts || 0) + 1,
    quiz_correct: (note.quiz_correct || 0) + Number(correct),
    review_level: reviewLevel,
    next_review: nextReview,
    last_practiced_at: now
  };
}
