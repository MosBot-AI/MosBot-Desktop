import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RichText, splitStreamingBlocks } from '../../src/renderer/features/chat/RichText';

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

describe('streaming Markdown', () => {
  it('splits finished blocks from the growing tail', () => {
    const split = splitStreamingBlocks('**done**\n\nstill gro');
    expect(split.blocks).toEqual(['**done**']);
    expect(split.tail).toBe('still gro');
  });

  it('keeps blank lines inside a fence in the growing tail', () => {
    const split = splitStreamingBlocks('intro\n\n```ts\nline one\n\nline two');
    expect(split.blocks).toEqual(['intro']);
    expect(split.tail).toBe('```ts\nline one\n\nline two');
  });

  it('does not split after a closed fence', () => {
    const split = splitStreamingBlocks('```ts\nx\n```\n\nnext');
    expect(split.blocks).toEqual(['```ts\nx\n```']);
    expect(split.tail).toBe('next');
  });

  it('closes a fence only with the same character and sufficient length', () => {
    const split = splitStreamingBlocks('```ts\ncode\n````\n\nnext');
    expect(split.blocks).toEqual(['```ts\ncode\n````']);
    const mismatched = splitStreamingBlocks('```\n~~~\n\nstill code');
    expect(mismatched.blocks).toEqual([]);
    expect(mismatched.tail).toContain('still code');
  });

  it('keeps a loose list in one growing block', () => {
    const split = splitStreamingBlocks('1. a\n\n2. b');
    expect(split.blocks).toEqual([]);
    expect(split.tail).toBe('1. a\n\n2. b');
  });

  it('keeps indented code lines together', () => {
    const split = splitStreamingBlocks('    code one\n\n    code two');
    expect(split.blocks).toEqual([]);
    expect(split.tail).toBe('    code one\n\n    code two');
  });

  it('renders finished blocks as Markdown and the tail as plain text', () => {
    const html = renderStreaming('**bold done**\n\n**still typ');
    expect(html).toContain('<strong>bold done</strong>');
    expect(html).toContain('**still typ');
    expect(html).not.toContain('<strong>still typ</strong>');
  });

  it('renders the same markup as the full pass once every block is complete', () => {
    const text = '**bold done**\n\n- one\n- two\n\n';
    expect(renderStreaming(text)).toBe(render(text));
  });
});

function renderStreaming(markdown: string, streaming = true): string {
  return renderToStaticMarkup(createElement(RichText, { text: markdown, streaming }));
}
