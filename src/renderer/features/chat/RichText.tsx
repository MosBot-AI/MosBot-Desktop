import type { ReactElement, ReactNode } from 'react';
import styles from './ChatView.module.css';

interface Segment {
  readonly kind: 'text' | 'code';
  readonly value: string;
}

type Block =
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'bullets'; readonly items: readonly string[] }
  | { readonly kind: 'numbers'; readonly items: readonly string[] }
  | { readonly kind: 'code'; readonly text: string };

/** Splits fenced code out first so fences never need inline handling. */
function splitFences(text: string): Segment[] {
  const pattern = /```[^\n]*\n([\s\S]*?)```/g;
  const segments: Segment[] = [];
  let cursor = 0;
  let match = pattern.exec(text);
  while (match !== null) {
    if (match.index > cursor) {
      segments.push({ kind: 'text', value: text.slice(cursor, match.index) });
    }
    segments.push({ kind: 'code', value: (match[1] ?? '').replace(/\n$/, '') });
    cursor = pattern.lastIndex;
    match = pattern.exec(text);
  }
  if (cursor < text.length) {
    segments.push({ kind: 'text', value: text.slice(cursor) });
  }
  return segments;
}

/**
 * Line-level grouping: headings and prose become paragraphs, consecutive
 * "-" and "1." lines become lists. The reference replies mix a heading with a
 * list inside one block, so paragraph-level classification is not enough.
 */
function textBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  let numbers: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
      paragraph = [];
    }
  };
  const flushBullets = (): void => {
    if (bullets.length > 0) {
      blocks.push({ kind: 'bullets', items: bullets });
      bullets = [];
    }
  };
  const flushNumbers = (): void => {
    if (numbers.length > 0) {
      blocks.push({ kind: 'numbers', items: numbers });
      numbers = [];
    }
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    if (line.trim() === '') {
      flushParagraph();
      flushBullets();
      flushNumbers();
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flushParagraph();
      flushNumbers();
      bullets.push(line.replace(/^\s*[-*]\s+/, ''));
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushParagraph();
      flushBullets();
      numbers.push(line.replace(/^\s*\d+[.)]\s+/, ''));
      continue;
    }
    flushBullets();
    flushNumbers();
    paragraph.push(line);
  }
  flushParagraph();
  flushBullets();
  flushNumbers();
  return blocks;
}

/** Inline code only: no raw HTML is ever interpreted. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const parts = text.split('`');
  parts.forEach((part, index) => {
    if (part === '') {
      return;
    }
    if (index % 2 === 1) {
      nodes.push(
        <code key={`${keyPrefix}-c${index}`} className={styles.inlineCode}>
          {part}
        </code>,
      );
    } else {
      nodes.push(<span key={`${keyPrefix}-t${index}`}>{part}</span>);
    }
  });
  return nodes;
}

export interface RichTextProps {
  readonly text: string;
}

/**
 * A deliberately small renderer for the design slice: paragraphs, lists and
 * fenced code. M1 replaces it with the full Markdown pipeline (sanitised, with
 * streaming block parsing); keeping it dependency-free now avoids inventing a
 * half-finished parser.
 */
export function RichText({ text }: RichTextProps): ReactElement {
  const segments = splitFences(text);
  return (
    <div className={styles.richText}>
      {segments.map((segment, segmentIndex) => {
        if (segment.kind === 'code') {
          return (
            <pre key={`seg-${segmentIndex}`} className={styles.codeBlock}>
              <code>{segment.value}</code>
            </pre>
          );
        }
        return textBlocks(segment.value).map((block, blockIndex) => {
          const key = `seg-${segmentIndex}-b${blockIndex}`;
          switch (block.kind) {
            case 'paragraph':
              return (
                <p key={key} className={styles.richParagraph}>
                  {inline(block.text, key)}
                </p>
              );
            case 'bullets':
              return (
                <ul key={key} className={styles.richList}>
                  {block.items.map((item, itemIndex) => (
                    <li key={`${key}-i${itemIndex}`}>{inline(item, `${key}-i${itemIndex}`)}</li>
                  ))}
                </ul>
              );
            case 'numbers':
              return (
                <ol key={key} className={styles.richList}>
                  {block.items.map((item, itemIndex) => (
                    <li key={`${key}-i${itemIndex}`}>{inline(item, `${key}-i${itemIndex}`)}</li>
                  ))}
                </ol>
              );
            case 'code':
              return (
                <pre key={key} className={styles.codeBlock}>
                  <code>{block.text}</code>
                </pre>
              );
          }
        });
      })}
    </div>
  );
}
