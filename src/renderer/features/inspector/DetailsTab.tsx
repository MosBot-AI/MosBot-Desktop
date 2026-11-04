import { useEffect, useState, type ReactElement } from 'react';
import type { BotProfile } from '../../../shared/domain';
import type { CronJob } from '../../../shared/protocol';
import { formatRelativeMinutes, presenceKey } from '../../app/format';
import { useMessages } from '../../app/i18n';
import { isRemoteRoster, selectRoutinesFor, useAppState, useDispatch } from '../../app/store';
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
  const dispatch = useDispatch();
  const remote = useAppState(isRemoteRoster);
  const organization = useAppState((state) => state.remoteOrg);
  const [newSection, setNewSection] = useState('');
  const [cronJobs, setCronJobs] = useState<readonly CronJob[] | null>(null);
  useEffect(() => {
    if (!remote) {
      return;
    }
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined) {
      return;
    }
    let cancelled = false;
    void dashboard.listCronJobs(bot.id).then((result) => {
      if (!cancelled) {
        setCronJobs(result.ok ? result.data : []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [remote, bot.id]);
  const pinned = organization.pinned.includes(bot.id);
  const currentSection = organization.sections.find((section) => section.botIds.includes(bot.id));

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

      {remote ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('inspector.manage.title')}</h3>
          <div className={styles.manageRow}>
            <button
              type="button"
              className={styles.manageButton}
              onClick={() => {
                dispatch({ type: 'org-toggle-pin', profile: bot.id });
              }}
            >
              {pinned ? t('inspector.manage.unpin') : t('inspector.manage.pin')}
            </button>
            <button
              type="button"
              className={styles.manageButton}
              onClick={() => {
                dispatch({ type: 'edit-open', profile: bot.id });
              }}
            >
              {t('inspector.manage.edit')}
            </button>
          </div>
          <label className={styles.manageField}>
            <span className={styles.manageLabel}>{t('inspector.manage.section')}</span>
            <select
              className={styles.manageSelect}
              value={currentSection?.id ?? ''}
              onChange={(event) => {
                dispatch({
                  type: 'org-move-bot',
                  profile: bot.id,
                  sectionId: event.target.value === '' ? null : event.target.value,
                });
              }}
            >
              <option value="">{t('inspector.manage.unsorted')}</option>
              {organization.sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.title}
                </option>
              ))}
            </select>
          </label>
          <form
            className={styles.manageField}
            onSubmit={(event) => {
              event.preventDefault();
              dispatch({ type: 'org-create-section', title: newSection });
              setNewSection('');
            }}
          >
            <input
              className={styles.manageInput}
              value={newSection}
              maxLength={24}
              placeholder={t('inspector.manage.newSection')}
              onChange={(event) => {
                setNewSection(event.target.value);
              }}
            />
            <button
              type="submit"
              className={styles.manageButton}
              disabled={newSection.trim() === ''}
            >
              {t('inspector.manage.addSection')}
            </button>
          </form>
        </section>
      ) : null}

      {bot.description === '' ? null : (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('inspector.details.about')}</h3>
          <p className={styles.description}>{bot.description}</p>
        </section>
      )}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('inspector.details.routines')}</h3>
        {remote ? (
          cronJobs === null ? (
            <p className={styles.empty}>{t('workbench.loading')}</p>
          ) : cronJobs.length === 0 ? (
            <p className={styles.empty}>{t('inspector.details.routinesEmpty')}</p>
          ) : (
            <ul className={styles.routineList}>
              {cronJobs.map((job) => (
                <li key={job.id} className={styles.routine}>
                  <span className={styles.routineName}>{job.name}</span>
                  <span className={styles.routineMeta}>
                    {job.schedule}
                    {job.enabled ? '' : ` · ${t('inspector.routine.disabled')}`}
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : routines.length === 0 ? (
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
