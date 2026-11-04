import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import type { Artifact, ArtifactState, ChatMessage } from '../../../shared/domain';
import type { BotArtifact, BotArtifactContent } from '../../../shared/protocol';
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

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const remote = useAppState(
    (state) => state.remote.status === 'ready' && state.remote.bots.length > 0,
  );
  const [remoteArtifacts, setRemoteArtifacts] = useState<readonly BotArtifact[]>([]);
  const [remoteStatus, setRemoteStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [preview, setPreview] = useState<BotArtifactContent | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const workspace = useAppState((state) => state.remote.workspaces[botId] ?? null);

  const loadRemote = useCallback(async (): Promise<void> => {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined) {
      return;
    }
    const result = await dashboard.listArtifacts(botId, workspace);
    if (!result.ok) {
      setRemoteStatus('error');
      return;
    }
    setRemoteArtifacts(result.data);
    setRemoteStatus('ready');
  }, [botId, workspace]);

  useEffect(() => {
    if (!remote) {
      return;
    }
    setRemoteStatus('loading');
    setPreview(null);
    setPreviewText(null);
    setSavedPath(null);
    void loadRemote();
  }, [remote, loadRemote]);

  if (remote) {
    const open = async (artifact: BotArtifact): Promise<void> => {
      const dashboard = window.mosbot?.dashboard;
      if (dashboard === undefined) {
        return;
      }
      setSavedPath(null);
      const content = await dashboard.readArtifact(artifact.path);
      if (!content.ok) {
        setRemoteStatus('error');
        return;
      }
      setPreview(content.data);
      if (artifact.kind === 'text' && content.data.dataUrl.length < 400_000) {
        const match = /^data:[^;,]*;base64,(.*)$/s.exec(content.data.dataUrl);
        if (match !== null) {
          try {
            const binary = atob(match[1] ?? '');
            const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
            setPreviewText(new TextDecoder().decode(bytes));
          } catch {
            setPreviewText(null);
          }
        }
      } else {
        setPreviewText(null);
      }
    };

    return (
      <div className={styles.tabContent}>
        <p className={styles.hint}>{t('inspector.library.remote.workspace')}</p>
        {remoteStatus === 'loading' ? (
          <p className={styles.hint}>{t('inspector.library.remote.loading')}</p>
        ) : remoteStatus === 'error' ? (
          <p className={styles.hint}>{t('inspector.library.remote.error')}</p>
        ) : remoteArtifacts.length === 0 ? (
          <p className={styles.empty}>{t('inspector.library.empty')}</p>
        ) : (
          <ul className={styles.artifactList}>
            {remoteArtifacts.map((artifact) => (
              <li key={artifact.path} className={styles.artifact}>
                <button
                  type="button"
                  className={styles.artifactHead}
                  aria-current={preview?.path === artifact.path ? 'true' : undefined}
                  onClick={() => {
                    void open(artifact);
                  }}
                >
                  <span className={styles.artifactName} title={artifact.name}>
                    {artifact.name}
                  </span>
                  <span className={styles.typeChip}>{artifact.kind.toUpperCase()}</span>
                </button>
                <div className={styles.artifactMeta}>
                  <span>{formatBytes(artifact.size)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {preview === null ? null : (
          <section className={styles.artifactPreview}>
            {previewText !== null ? (
              <pre className={styles.previewText}>{previewText}</pre>
            ) : preview.mimeType.startsWith('image/') ? (
              <img className={styles.computerFrame} src={preview.dataUrl} alt={preview.name} />
            ) : (
              <p className={styles.hint}>{t('inspector.library.remote.pdfHint')}</p>
            )}
            <button
              type="button"
              className={styles.wakeButton}
              onClick={() => {
                const dashboard = window.mosbot?.dashboard;
                if (dashboard === undefined) {
                  return;
                }
                void dashboard.saveArtifact(preview.path, preview.name).then((result) => {
                  if (result.ok) {
                    setSavedPath(result.data);
                  } else {
                    setSavedPath(null);
                    setRemoteStatus('error');
                  }
                });
              }}
            >
              {t('inspector.library.remote.save')}
            </button>
            {savedPath === null ? null : (
              <p className={styles.hint}>{t('inspector.library.remote.saved')}</p>
            )}
          </section>
        )}
      </div>
    );
  }

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
