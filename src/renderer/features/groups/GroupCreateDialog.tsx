import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useMessages } from '../../app/i18n';
import { useAppState, useDispatch } from '../../app/store';
import styles from '../create/CreateBotDialog.module.css';

const TITLE_ID = 'create-group-title';
const NAME_ID = 'create-group-name';

export interface GroupCreateDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/** Small create-group dialog: name plus a 2-6 profile roster. */
export function GroupCreateDialog({ open, onClose }: GroupCreateDialogProps): ReactElement | null {
  const t = useMessages();
  const dispatch = useDispatch();
  const bots = useAppState((state) => state.remote.bots);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName('');
    setSelected([]);
    setBusy(false);
    setError(null);
    nameRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const canSubmit = name.trim() !== '' && selected.length >= 2 && selected.length <= 6 && !busy;

  const toggle = (profileName: string): void => {
    setSelected((current) => {
      if (current.includes(profileName)) {
        return current.filter((value) => value !== profileName);
      }
      if (current.length >= 6) {
        return current;
      }
      return [...current, profileName];
    });
    setError(null);
  };

  const submit = async (): Promise<void> => {
    const dashboard = window.mosbot?.dashboard;
    if (dashboard === undefined || !canSubmit) {
      return;
    }
    setBusy(true);
    setError(null);
    const members = selected.map((profileName, index) => ({
      memberId: `member-${index + 1}`,
      profile: profileName,
      handle: `member-${index + 1}`,
      displayName: bots.find((bot) => bot.profileName === profileName)?.displayName ?? profileName,
    }));
    const created = await dashboard.chatGroupCreate(name.trim(), members);
    if (!created.ok) {
      setBusy(false);
      setError(t('groupCreate.error'));
      return;
    }
    const refreshed = await dashboard.chatListGroups();
    if (refreshed.ok) {
      dispatch({ type: 'remote-groups', groups: [...refreshed.data] });
    }
    dispatch({ type: 'select-group', group: created.data });
    setBusy(false);
    onClose();
  };

  return (
    <div
      className={styles.scrim}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        ref={dialogRef}
      >
        <h2 className={styles.title} id={TITLE_ID}>
          {t('groupCreate.title')}
        </h2>
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={NAME_ID}>
              {t('groupCreate.name')}
            </label>
            <input
              className={styles.nameInput}
              id={NAME_ID}
              ref={nameRef}
              value={name}
              maxLength={120}
              placeholder={t('groupCreate.namePlaceholder')}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
          </div>
          <fieldset className={styles.fieldGroup}>
            <legend>{t('groupCreate.members')}</legend>
            <div className={styles.chips}>
              {bots.map((bot) => (
                <label key={bot.profileName} className={styles.chipOption}>
                  <input
                    type="checkbox"
                    checked={selected.includes(bot.profileName)}
                    disabled={!selected.includes(bot.profileName) && selected.length >= 6}
                    onChange={() => {
                      toggle(bot.profileName);
                    }}
                  />
                  <span className={styles.chip}>{bot.displayName}</span>
                </label>
              ))}
            </div>
            <p className={styles.label}>{t('groupCreate.hint')}</p>
          </fieldset>
          {error === null ? null : (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            {t('groupCreate.cancel')}
          </button>
          <button
            type="button"
            className={styles.submitButton}
            disabled={!canSubmit}
            onClick={() => {
              void submit();
            }}
          >
            {busy ? t('groupCreate.creating') : t('groupCreate.create')}
          </button>
        </footer>
      </div>
    </div>
  );
}
