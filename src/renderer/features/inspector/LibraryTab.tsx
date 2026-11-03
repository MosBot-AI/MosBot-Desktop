import { useMemo, type ReactElement } from 'react';
import type { Artifact, ArtifactState, ChatMessage } from '../../../shared/domain';
import { formatRelativeMinutes } from '../../app/format';
import { type MessageKey, useMessages } from '../../app/i18n';
import { useAppState } from '../../app/store';
import styles from './InspectorPanel.module.css';

export interface LibraryTabProps {
  readonly botId: string;
}

type UnreadyArtifactState = Exclude<ArtifactState, 'ready'>;

const STATE_KEYS: Record<UnreadyArtifactState, MessageKey> = {
  expired: 'inspector.library.state.expired',
  denied: 'inspector.library.state.denied',
  deleted: 'inspector.library.state.deleted',
};

const STATE_TONES: Record<UnreadyArtifactState, string | undefined> = {
  expired: styles.badgeWarning,
  denied: styles.badgeDanger,
  deleted: styles.badgeMuted,
};

/** The file extension is the honest, locale-neutral stand-in for the item type. */
function fileType(name: string): string | null {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) {
    return null;
  }
  const extension = name.slice(dot + 1);
  return /^[a-z0-9]{1,5}$/i.test(extension) ? extension.toUpperCase() : null;
}

function isUnready(state: ArtifactState): state is UnreadyArtifactState {
  return state !== 'ready';
}

/** One line of the message an artifact was produced from, if it still exists. */
function sourceExcerpt(
  messages: readonly ChatMessage[] | undefined,
  messageId: string,
): string | null {
  const message = messages?.find((item) => item.id === messageId);
  if (message === undefined) {
    return null;
  }
  switch (message.kind) {
    case 'text':
      return message.text.split('\n').find((line) => line.trim() !== '') ?? null;
    case 'work':
      return message.title;
    case 'approval':
      return message.approval.title;
    case 'clarify':
      return message.clarify.question;
    case 'stopped':
      return null;
  }
}

/** Artifacts registered for this Bot. Preview/save/open arrive with M4. */
export function LibraryTab({ botId }: LibraryTabProps): ReactElement {
  const t = useMessages();
  const language = useAppState((state) => state.language);
  const allArtifacts = useAppState((state) => state.artifacts);
  const messages = useAppState((state) => state.messages[botId]);
  const artifacts = useMemo(
    () => allArtifacts.filter((artifact: Artifact) => artifact.profileId === botId),
    [allArtifacts, botId],
  );

  if (artifacts.length === 0) {
    return <p className={styles.empty}>{t('inspector.library.empty')}</p>;
  }

  return (
    <ul className={styles.artifactList}>
      {artifacts.map((artifact) => {
        const type = fileType(artifact.name);
        const excerpt = sourceExcerpt(messages, artifact.sourceMessageId);
        return (
          <li key={artifact.id} className={styles.artifact} data-state={artifact.state}>
            <div className={styles.artifactHead}>
              <span className={styles.artifactName} title={artifact.name}>
                {artifact.name}
              </span>
              {type === null ? null : <span className={styles.typeChip}>{type}</span>}
              {isUnready(artifact.state) ? (
                <span className={[styles.badge, STATE_TONES[artifact.state]].join(' ')}>
                  {t(STATE_KEYS[artifact.state])}
                </span>
              ) : (
                <span className={[styles.badge, styles.badgeReady].join(' ')}>
                  {t('inspector.library.state.ready')}
                </span>
              )}
            </div>
            <div className={styles.artifactMeta}>
              <span>{artifact.sizeLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{t('inspector.library.source')}</span>
              <span aria-hidden="true">·</span>
              <span>{formatRelativeMinutes(language, artifact.createdMinutesAgo)}</span>
            </div>
            {excerpt === null ? null : (
              <p className={styles.artifactExcerpt} title={excerpt}>
                {excerpt}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
