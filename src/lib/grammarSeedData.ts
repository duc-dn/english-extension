import { db, addGrammarNote, type GrammarNote } from './db';
import { GRAMMAR_TOPIC_CATALOG, catalogItemToGrammarNote } from './grammarCatalog';

export const FOUNDATIONAL_GRAMMAR_SEEDS: Omit<GrammarNote, 'id' | 'created_at' | 'review_level' | 'next_review'>[] = 
  GRAMMAR_TOPIC_CATALOG.slice(0, 4).map(item => catalogItemToGrammarNote(item));


export async function seedFoundationalGrammarNotes(): Promise<number> {
  const existingNotes = await db.grammar_notes.toArray();
  const existingTitles = new Set(existingNotes.map(n => n.title.toLowerCase().trim()));

  let count = 0;
  for (const item of FOUNDATIONAL_GRAMMAR_SEEDS) {
    if (!existingTitles.has(item.title.toLowerCase().trim())) {
      await addGrammarNote(item);
      count++;
    }
  }
  return count;
}
