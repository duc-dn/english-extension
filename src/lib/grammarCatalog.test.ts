import { describe, it, expect } from 'vitest';
import { 
  GRAMMAR_TOPIC_CATALOG, 
  GRAMMAR_CATEGORIES, 
  catalogItemToGrammarNote 
} from './grammarCatalog';

describe('grammarCatalog', () => {
  it('has a valid catalog of grammar topics with all required fields', () => {
    expect(GRAMMAR_TOPIC_CATALOG.length).toBeGreaterThanOrEqual(16);

    for (const item of GRAMMAR_TOPIC_CATALOG) {
      expect(item.id).toBeTruthy();
      expect(item.title).toBeTruthy();
      expect(item.category).toBeTruthy();
      expect(['B1', 'B2', 'C1']).toContain(item.level);
      expect(item.formula).toBeTruthy();
      expect(item.explanation).toBeTruthy();
      expect(item.examplesList.length).toBeGreaterThan(0);
      expect(item.exercises).toBeDefined();
      expect((item.exercises.multipleChoice?.length || 0) + (item.exercises.translation?.length || 0)).toBeGreaterThan(0);
    }
  });

  it('has categories metadata matching items in catalog', () => {
    const categoryIds = new Set(GRAMMAR_CATEGORIES.map(c => c.id));
    expect(categoryIds.has('all')).toBe(true);

    for (const item of GRAMMAR_TOPIC_CATALOG) {
      expect(categoryIds.has(item.category)).toBe(true);
    }
  });

  it('correctly converts catalog topic to GrammarNote format', () => {
    const sample = GRAMMAR_TOPIC_CATALOG[0];
    const converted = catalogItemToGrammarNote(sample);

    expect(converted.title).toBe(sample.title);
    expect(converted.formula).toBe(sample.formula);
    expect(converted.explanation).toBe(sample.explanation);
    expect(converted.content).toContain(sample.formula);
    expect(converted.content).toContain(sample.explanation);
    expect(converted.examplesList).toEqual(sample.examplesList);
    expect(converted.exercises).toEqual(sample.exercises);
  });
});
