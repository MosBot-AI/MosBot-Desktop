import type { ReactElement } from 'react';
import type { Presence } from '../../../shared/domain';
import styles from './BotStatusDot.module.css';

export interface BotStatusDotProps {
  readonly presence: Presence;
  readonly size?: 'sm' | 'md';
  readonly className?: string | undefined;
}

/** A quiet presence dot: colour carries the state, the label lives in text. */
export function BotStatusDot({
  presence,
  size = 'md',
  className,
}: BotStatusDotProps): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={[styles.dot, styles[presence], styles[size], className ?? ''].join(' ').trim()}
    />
  );
}
