import { memo, useMemo, type ReactElement, type ReactNode } from 'react';
import { lexer, type Token, type Tokens } from 'marked';
import styles from './ChatView.module.css';

/**
 * Markdown for the transcript. Tokens come from `marked.lexer`, so raw HTML in a
 * message is rendered as text (never injected) and links go through the main
 * process before opening in the system browser.
 */
function inlineNodes(tokens: readonly Token[] | undefined, keyPrefix: string): ReactNode[] {
  if (tokens === undefined) {
    return [];
  }
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-i${index}`;
    switch (token.type) {
      case 'text': {
        const text = token as Tokens.Text;
        if (text.tokens === undefined) {
          return text.text;
        }
        return inlineNodes(text.tokens, key);
      }
      case 'strong': {
        const strong = token as Tokens.Strong;
        return <strong key={key}>{inlineNodes(strong.tokens, key)}</strong>;
      }
      case 'em': {
        const em = token as Tokens.Em;
        return <em key={key}>{inlineNodes(em.tokens, key)}</em>;
      }
      case 'del': {
        const del = token as Tokens.Del;
        return <del key={key}>{inlineNodes(del.tokens, key)}</del>;
      }
      case 'codespan':
        return (
          <code key={key} className={styles.inlineCode}>
            {(token as Tokens.Codespan).text}
          </code>
        );
      case 'br':
        return <br key={key} />;
      case 'escape':
        return (token as Tokens.Escape).text;
      case 'link': {
        const link = token as Tokens.Link;
        const safe = /^https:\/\//i.test(link.href);
        if (!safe) {
          return <span key={key}>{link.text}</span>;
        }
        return (
          <a
            key={key}
            href={link.href}
            rel="noreferrer"
            onClick={(event) => {
              event.preventDefault();
              void window.mosbot?.openExternal(link.href);
            }}
          >
            {inlineNodes(link.tokens, key)}
          </a>
        );
      }
      case 'image': {
        const image = token as Tokens.Image;
        return (
          <span key={key} className={styles.inlineNote}>
            {image.text === '' ? '[image]' : `[image: ${image.text}]`}
          </span>
        );
      }
      case 'html':
        return (token as Tokens.HTML).text;
      default:
        return <span key={key}>{token.raw}</span>;
    }
  });
}

function listItemNodes(item: Tokens.ListItem, keyPrefix: string): ReactNode {
  const blockTokens = item.tokens.filter(
    (token) => token.type !== 'text' || (token as Tokens.Text).tokens !== undefined,
  );
  const first = blockTokens[0];
  if (blockTokens.length === 1 && first !== undefined && first.type === 'text') {
    return inlineNodes((first as Tokens.Text).tokens, keyPrefix);
  }
  return blockTokens.map((token, index) => blockNode(token, `${keyPrefix}-b${index}`));
}

function blockNode(token: Token, key: string): ReactNode {
  switch (token.type) {
    case 'heading': {
      const heading = token as Tokens.Heading;
      return (
        <p key={key} className={styles.mdHeading}>
          {inlineNodes(heading.tokens, key)}
        </p>
      );
    }
    case 'paragraph': {
      const paragraph = token as Tokens.Paragraph;
      return (
        <p key={key} className={styles.richParagraph}>
          {inlineNodes(paragraph.tokens, key)}
        </p>
      );
    }
    case 'text': {
      const text = token as Tokens.Text;
      return (
        <p key={key} className={styles.richParagraph}>
          {text.tokens === undefined ? text.text : inlineNodes(text.tokens, key)}
        </p>
      );
    }
    case 'code': {
      const code = token as Tokens.Code;
      return (
        <pre key={key} className={styles.codeBlock}>
          <code>{code.text}</code>
        </pre>
      );
    }
    case 'blockquote': {
      const quote = token as Tokens.Blockquote;
      return (
        <blockquote key={key} className={styles.mdQuote}>
          {quote.tokens.map((child, index) => blockNode(child, `${key}-q${index}`))}
        </blockquote>
      );
    }
    case 'list': {
      const list = token as Tokens.List;
      const items = list.items.map((item, index) => (
        <li key={`${key}-l${index}`}>{listItemNodes(item, `${key}-l${index}`)}</li>
      ));
      return list.ordered ? (
        <ol key={key} className={styles.richList}>
          {items}
        </ol>
      ) : (
        <ul key={key} className={styles.richList}>
          {items}
        </ul>
      );
    }
    case 'table': {
      const table = token as Tokens.Table;
      return (
        <div key={key} className={styles.mdTableWrap}>
          <table className={styles.mdTable}>
            <thead>
              <tr>
                {table.header.map((cell, index) => (
                  <th key={`${key}-h${index}`}>{inlineNodes(cell.tokens, `${key}-h${index}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={`${key}-r${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${key}-r${rowIndex}c${cellIndex}`}>
                      {inlineNodes(cell.tokens, `${key}-r${rowIndex}c${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'hr':
      return <hr key={key} className={styles.mdRule} />;
    case 'space':
      return null;
    case 'html':
      return (
        <p key={key} className={styles.richParagraph}>
          {(token as Tokens.HTML).text}
        </p>
      );
    default:
      return (
        <p key={key} className={styles.richParagraph}>
          {token.raw}
        </p>
      );
  }
}

/** Bounded cache for streams that contain many completed blocks. */
const STREAM_BLOCK_CACHE_LIMIT = 512;
const streamBlockCache = new Map<string, readonly Token[]>();

function lexBlock(text: string): readonly Token[] {
  const cached = streamBlockCache.get(text);
  if (cached !== undefined) {
    // LRU: refresh recency so blocks that keep appearing stay cached.
    streamBlockCache.delete(text);
    streamBlockCache.set(text, cached);
    return cached;
  }
  const tokens = lexer(text);
  streamBlockCache.set(text, tokens);
  if (streamBlockCache.size > STREAM_BLOCK_CACHE_LIMIT) {
    const oldest = streamBlockCache.keys().next().value;
    if (oldest !== undefined) {
      streamBlockCache.delete(oldest);
    }
  }
  return tokens;
}

interface Fence {
  readonly char: '`' | '~';
  readonly length: number;
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const LIST_ITEM = /^ {0,3}([-*+]|\d{1,9}[.)])\s+/;
const INDENTED_LINE = /^(?: {4}|\t)/;

function fenceOpening(line: string): Fence | null {
  const match = FENCE_OPEN.exec(line);
  const marker = match?.[1];
  if (marker === undefined) {
    return null;
  }
  return { char: marker[0] === '`' ? '`' : '~', length: marker.length };
}

function closesFence(line: string, fence: Fence): boolean {
  const match = FENCE_CLOSE.exec(line);
  const marker = match?.[1];
  if (marker === undefined) {
    return false;
  }
  const char = marker[0] === '`' ? '`' : '~';
  return char === fence.char && marker.length >= fence.length;
}

interface ListMarker {
  readonly kind: 'ordered' | 'bullet';
  readonly delimiter: string;
}

function listMarker(line: string): ListMarker | null {
  const match = LIST_ITEM.exec(line);
  const marker = match?.[1];
  if (marker === undefined) {
    return null;
  }
  if (/^\d/.test(marker)) {
    return { kind: 'ordered', delimiter: marker.slice(-1) };
  }
  return { kind: 'bullet', delimiter: marker };
}

function isIndentedCode(lines: readonly string[]): boolean {
  const nonEmpty = lines.filter((line) => line.trim() !== '');
  return nonEmpty.length > 0 && nonEmpty.every((line) => INDENTED_LINE.test(line));
}

function nextNonBlankLine(lines: readonly string[], from: number): string | null {
  for (let index = from; index < lines.length; index += 1) {
    const line = lines[index];
    if (line !== undefined && line.trim() !== '') {
      return line;
    }
  }
  return null;
}

/**
 * Whether a blank line really ends the current block. Loose list items and
 * indented code keep their block open, because the full Markdown pass would
 * render them as one list/code block; splitting them mid-stream makes the
 * transcript visibly jump at the terminal render.
 */
function shouldSplitAtBlank(buffer: readonly string[], nextLine: string | null): boolean {
  if (nextLine === null) {
    return true;
  }
  if (buffer.length === 0) {
    return false;
  }
  if (isIndentedCode(buffer)) {
    return false;
  }
  const lastLine = [...buffer].reverse().find((line) => line.trim() !== '');
  const lastList = lastLine === undefined ? null : listMarker(lastLine);
  const nextList = listMarker(nextLine);
  return !(
    lastList !== null &&
    nextList !== null &&
    lastList.kind === nextList.kind &&
    lastList.delimiter === nextList.delimiter
  );
}

/**
 * Splits streamed Markdown at blank lines that are not inside a fenced code
 * block and not inside a loose list. Everything before the final block is
 * stable and can be parsed (and memoised) once; the final block is still growing.
 */
export function splitStreamingBlocks(text: string): {
  readonly blocks: readonly string[];
  readonly tail: string;
} {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let buffer: string[] = [];
  let fence: Fence | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (fence !== null) {
      buffer.push(line);
      if (closesFence(line, fence)) {
        fence = null;
      }
      continue;
    }
    const opening = fenceOpening(line);
    if (opening !== null) {
      fence = opening;
      buffer.push(line);
      continue;
    }
    if (line.trim() === '') {
      const next = nextNonBlankLine(lines, index + 1);
      if (!shouldSplitAtBlank(buffer, next)) {
        if (buffer.length > 0) {
          buffer.push(line);
        }
        continue;
      }
      if (buffer.length > 0) {
        blocks.push(buffer.join('\n'));
        buffer = [];
      }
      continue;
    }
    buffer.push(line);
  }

  return { blocks, tail: buffer.join('\n') };
}

/** A finished Markdown block: identity-stable tokens let React skip the subtree. */
const StreamBlock = memo(function StreamBlock({
  text,
  blockKey,
}: {
  readonly text: string;
  readonly blockKey: string;
}): ReactElement {
  const tokens = lexBlock(text);
  return <>{tokens.map((token, index) => blockNode(token, `${blockKey}-${index}`))}</>;
});

export interface RichTextProps {
  readonly text: string;
  /**
   * Live turn text: finished blocks render as Markdown, the still-growing tail
   * renders as plain text so a long reply is never re-tokenised per batch. The
   * terminal render switches back to the full Markdown pass.
   */
  readonly streaming?: boolean;
}

export function RichText({ text, streaming = false }: RichTextProps): ReactElement {
  const tokens = useMemo(() => (streaming ? null : lexer(text)), [text, streaming]);
  const split = useMemo(() => (streaming ? splitStreamingBlocks(text) : null), [text, streaming]);
  if (streaming && split !== null) {
    const { blocks, tail } = split;
    return (
      <div className={styles.richText}>
        {blocks.map((block, index) => (
          <StreamBlock key={`sb-${index}`} text={block} blockKey={`sb-${index}`} />
        ))}
        {tail === '' ? null : <p className={styles.richParagraph}>{tail}</p>}
      </div>
    );
  }
  return (
    <div className={styles.richText}>
      {tokens?.map((token, index) => blockNode(token, `md-${index}`))}
    </div>
  );
}
