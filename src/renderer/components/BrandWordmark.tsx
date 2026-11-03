import type { ReactElement } from 'react';
import {
  WORDMARK_EYE_PATHS,
  WORDMARK_LETTER_PATHS,
  WORDMARK_VIEW_BOX,
} from '../assets/brand/artwork';
import styles from './BrandWordmark.module.css';

export interface BrandWordmarkProps {
  /** Rendered height in px; the wordmark keeps its 1280×280 ratio. */
  readonly height?: number;
  readonly className?: string;
}

/**
 * MosBot wordmark drawn from the mobile project's own path data (see
 * docs/assets/brand.md): letters follow the text colour, the eyes keep the
 * brand lime. Inline SVG rather than a CSS mask so packaged file:// builds and
 * the strict CSP cannot drop it.
 */
export function BrandWordmark({ height = 16, className }: BrandWordmarkProps): ReactElement {
  const width = Math.round((height * 1280) / 280);
  return (
    <svg
      role="img"
      aria-label="MosBot"
      focusable="false"
      width={width}
      height={height}
      viewBox={WORDMARK_VIEW_BOX}
      className={[styles.wordmark, className ?? ''].join(' ').trim()}
    >
      <g fill="currentColor" fillRule="evenodd">
        {WORDMARK_LETTER_PATHS.map((path, index) => (
          <path key={`letter-${index}`} d={path} />
        ))}
      </g>
      <g fill="var(--accent-brand)">
        {WORDMARK_EYE_PATHS.map((path, index) => (
          <path key={`eye-${index}`} d={path} />
        ))}
      </g>
    </svg>
  );
}
