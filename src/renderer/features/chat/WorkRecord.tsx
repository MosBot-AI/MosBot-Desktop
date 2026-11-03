import { useId, useState, type ReactElement } from 'react';
import type { WorkStep } from '../../../shared/domain';
import { useMessages } from '../../app/i18n';
import { IconChevronDown } from '../../components/icons';
import styles from './ChatView.module.css';

export interface WorkRecordProps {
  readonly title: string;
  readonly steps: readonly WorkStep[];
}

/**
 * Consecutive tool details are merged into one collapsible record so the body
 * of the answer stays continuous. Collapsed by default; the summary keeps the
 * step count visible.
 */
export function WorkRecord({ title, steps }: WorkRecordProps): ReactElement {
  const t = useMessages();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className={styles.work}>
      <button
        type="button"
        className={styles.workToggle}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <IconChevronDown size={12} className={open ? styles.chevronOpen : styles.chevronClosed} />
        <span className={styles.workTitle}>{t('chat.work.title')}</span>
        <span className={styles.workMeta}>
          {title === '' ? null : `${title} · `}
          {t('chat.work.steps', { count: steps.length })}
        </span>
      </button>
      {open ? (
        <ol className={styles.workSteps} id={panelId}>
          {steps.map((step) => (
            <li key={step.id} className={styles.workStep}>
              <span className={styles.workStepLabel}>{step.label}</span>
              <span className={styles.workStepDetail}>{step.detail}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
