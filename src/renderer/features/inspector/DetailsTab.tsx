import type { ReactElement } from 'react';
import type { BotProfile } from '../../../shared/domain';
import { formatRelativeMinutes, presenceKey } from '../../app/format';
import { useMessages } from '../../app/i18n';
import { selectRoutinesFor, useAppState } from '../../app/store';
import { BotLookFace } from '../bots/BotLookFace';
import { BotStatusDot } from '../bots/BotStatusDot';
import styles from './InspectorPanel.module.css';

export interface DetailsTabProps {
  readonly bot: BotProfile;
}

/** Who this Bot is, what it does on a schedule and when it last worked. */
export function DetailsTab({ bot }: DetailsTabProps): ReactElement {
  const t = useMessages();
  const language = useAppState((state) => state.language);
  const routines = useAppState(selectRoutinesFor);

  return (
    <div className={styles.tabContent}>
      <div className={styles.identity}>
        <BotLookFace
          shape={bot.shape}
          color={bot.color}
          useMosbotDefault={bot.useMosbotDefault}
          seed={bot.id}
          size={76}
          presence={bot.presence}
        />
        <div className={styles.identityText}>
          <h2 className={styles.botName} title={bot.name}>
            {bot.name}
          </h2>
          <p className={styles.presence}>
            <BotStatusDot presence={bot.presence} size="sm" />
            <span>{t(presenceKey(bot.presence))}</span>
          </p>
          <p className={styles.lastActive}>
            {t('inspector.details.lastActive', {
              label: formatRelativeMinutes(language, bot.lastActiveMinutes),
            })}
          </p>
        </div>
      </div>

      {bot.description === '' ? null : (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('inspector.details.about')}</h3>
          <p className={styles.description}>{bot.description}</p>
        </section>
      )}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('inspector.details.routines')}</h3>
        {routines.length === 0 ? (
          <p className={styles.empty}>{t('inspector.details.routinesEmpty')}</p>
        ) : (
          <ul className={styles.routineList}>
            {routines.map((routine) => (
              <li
                key={routine.id}
                className={styles.routine}
                data-enabled={routine.enabled ? 'true' : 'false'}
              >
                <span className={styles.routineTitle} title={routine.title}>
                  {routine.title}
                </span>
                <span className={styles.routineMeta}>
                  <span>{routine.scheduleLabel}</span>
                  {routine.enabled ? null : (
                    <span className={styles.routineDisabled}>
                      {t('inspector.routine.disabled')}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
