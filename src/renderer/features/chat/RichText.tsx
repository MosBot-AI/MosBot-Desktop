import { useMemo, type ReactElement, type ReactNode } from 'react';
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

export interface RichTextProps {
  readonly text: string;
}

export function RichText({ text }: RichTextProps): ReactElement {
  const blocks = useMemo(() => lexer(text), [text]);
  return (
    <div className={styles.richText}>
      {blocks.map((token, index) => blockNode(token, `md-${index}`))}
    </div>
  );
}
