import { marked } from 'marked';

/** Convert an AI Markdown reply into a safe HTML fragment for rich-text paste. */
export function markdownToClipboardHtml(markdown: string): string {
  const html = marked.parse(markdown, { async: false, gfm: true, breaks: true }) as string;
  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc.body.querySelectorAll('script, style, iframe, object, embed, form, input, button, link, meta').forEach(el => el.remove());
  doc.body.querySelectorAll('*').forEach(el => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'style' || name === 'src' ||
          (name === 'href' && !/^(https?:|mailto:|#)/i.test(attr.value.trim()))) {
        el.removeAttribute(attr.name);
      }
    }
  });

  // Google Docs keeps table structure more reliably when cells have borders.
  doc.body.querySelectorAll('table').forEach(table => table.setAttribute('style', 'border-collapse: collapse;'));
  doc.body.querySelectorAll('th, td').forEach(cell => cell.setAttribute('style', 'border: 1px solid #cbd5e1; padding: 4px 8px;'));
  return `<html><body>${doc.body.innerHTML}</body></html>`;
}
