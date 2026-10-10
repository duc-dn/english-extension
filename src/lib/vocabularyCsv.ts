import type { Word, WordInput } from './db';

const columns = ['word', 'meaning', 'phonetic', 'example', 'description', 'tags'] as const;

function parseRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '' && !closedQuote) {
      quoted = true;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(field);
      field = '';
      closedQuote = false;
      if (char !== ',') {
        if (row.some(value => value.trim())) rows.push(row);
        row = [];
        if (char === '\r' && csv[i + 1] === '\n') i++;
      }
    } else if (closedQuote || char === '"') {
      throw new Error('Invalid CSV quoting.');
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  row.push(field);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function decodeCell(value: string): string {
  const trimmed = value.trim();
  return /^'\s*[=+\-@]/.test(trimmed) ? trimmed.slice(1) : trimmed;
}

export function parseVocabularyCsv(csv: string): { words: WordInput[]; skipped: number } {
  const rows = parseRows(csv.replace(/^\uFEFF/, ''));
  if (!rows.length) throw new Error('CSV file is empty.');
  const headers = rows[0].map(header => header.trim().toLowerCase());
  if (!headers.includes('word') || !headers.includes('meaning')) {
    throw new Error('CSV must contain word and meaning columns.');
  }

  const words: WordInput[] = [];
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const item = Object.fromEntries(headers.map((header, index) => [header, decodeCell(row[index] || '')]));
    if (!item.word || !item.meaning) {
      skipped++;
      continue;
    }
    words.push({
      word: item.word,
      meaning: item.meaning,
      phonetic: item.phonetic || '',
      example: item.example || '',
      description: item.description || '',
      tags: (item.tags || '').split(';').map(tag => tag.trim()).filter(Boolean)
    });
  }
  return { words, skipped };
}

function escapeCell(value: string): string {
  const safe = /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildVocabularyCsv(words: Word[]): string {
  const rows = words.map(word => columns.map(column =>
    escapeCell(column === 'tags' ? (word.tags || []).join('; ') : String(word[column] || ''))
  ).join(','));
  return `\uFEFF${columns.join(',')}\r\n${rows.join('\r\n')}${rows.length ? '\r\n' : ''}`;
}
