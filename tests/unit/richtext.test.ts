import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RichText } from '../../src/renderer/features/chat/RichText';

function render(markdown: string): string {
  return renderToStaticMarkup(createElement(RichText, { text: markdown }));
}

describe('Markdown transcript rendering', () => {
  it('renders headings, emphasis and inline code', () => {
    const html = render('# Title\n\nThis is **bold** and *italic* with `code`.');
    expect(html).toContain('Title');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code');
    expect(html).toContain('code');
  });

  it('renders fenced code blocks and lists', () => {
    const html = render('Intro\n\n```ts\nconst x = 1;\n```\n\n- one\n- two');
    expect(html).toContain('<pre');
    expect(html).toContain('const x = 1;');
    expect(html).toContain('<ul');
    expect(html).toContain('<li>one</li>');
  });

  it('renders tables and blockquotes', () => {
    const html = render('| A | B |\n| - | - |\n| 1 | 2 |\n\n> quoted');
    expect(html).toContain('<table');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>1</td>');
    expect(html).toContain('<blockquote');
  });

  it('never injects raw HTML from a message', () => {
    const html = render('<script>alert(1)</script> and <b>tag</b>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<b>tag');
    expect(html).toContain('&lt;script&gt;');
  });

  it('only renders https links as clickable anchors', () => {
    const html = render('[safe](https://example.com/x) [unsafe](http://example.com/y)');
    expect(html).toContain('href="https://example.com/x"');
    expect(html).not.toContain('href="http://example.com/y"');
    expect(html).toContain('unsafe');
  });

  it('renders images as a textual note instead of loading them', () => {
    const html = render('![alt text](https://example.com/a.png)');
    expect(html).toContain('[image: alt text]');
    expect(html).not.toContain('<img');
  });
});
