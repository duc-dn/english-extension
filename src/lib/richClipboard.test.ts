import { describe, expect, it } from 'vitest';
import { markdownToClipboardHtml } from './richClipboard';

describe('Markdown clipboard HTML', () => {
  it('preserves headings, emphasis, lists, links, and tables for rich paste', () => {
    const html = markdownToClipboardHtml('# Heading\n\n**Bold** and [link](https://example.com)\n\n- First\n\n| A | B |\n|---|---|\n| 1 | 2 |');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('h1')?.textContent).toBe('Heading');
    expect(doc.querySelector('strong')?.textContent).toBe('Bold');
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    expect(doc.querySelector('li')?.textContent).toBe('First');
    expect(doc.querySelectorAll('table tr')).toHaveLength(2);
  });

  it('removes executable HTML from AI output', () => {
    const html = markdownToClipboardHtml('<script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(1)">bad</a>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
  });
});
