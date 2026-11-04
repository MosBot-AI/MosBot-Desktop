import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from 'react';
import { botColorSwatches, normalizeColor } from '../../../shared/color';
import { BOT_SHAPES, type BotShape } from '../../../shared/domain';
import { type MessageKey, useMessages } from '../../app/i18n';
import { MAX_NAME_LENGTH, isRemoteRoster, useAppState, useDispatch } from '../../app/store';
import { BotLookFace } from '../bots/BotLookFace';
import styles from './CreateBotDialog.module.css';

const TITLE_ID = 'create-bot-title';
const NAME_INPUT_ID = 'create-name';
const NAME_COUNT_ID = 'create-name-count';
const ERROR_ID = 'create-error';

const SHAPE_KEYS: Record<BotShape, MessageKey> = {
  mosbot: 'shape.mosbot',
  circle: 'shape.circle',
  squircle: 'shape.squircle',
  pill: 'shape.pill',
  triangle: 'shape.triangle',
  hexagon: 'shape.hexagon',
  cloud: 'shape.cloud',
  drop: 'shape.drop',
  blobatar: 'shape.blobatar',
};

const ERROR_KEYS = {
  empty: 'create.error.empty',
  duplicate: 'create.error.duplicate',
} as const;

const SWATCHES: readonly string[] = botColorSwatches();

/**
 * Centred create-Bot dialog: shape and colour drive the face preview
 * immediately, and Create only becomes available for a non-blank name. The
 * store owns validation (empty/duplicate) and selects the new Bot on success.
 */
export function CreateBotDialog(): ReactElement | null {
  const create = useAppState((state) => state.create);
  const remoteMode = useAppState((state) => isRemoteRoster(state));
  const dispatch = useDispatch();
  const t = useMessages();

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  const open = create.open;
  const error = create.error;
  const canSubmit = create.name.trim() !== '' && !create.busy;
  const seed = create.name === '' ? 'new-bot' : create.name;

  useEffect(() => {
    if (open && !wasOpen.current) {
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement ? active : null;
      nameInputRef.current?.focus({ preventScroll: true });
      nameInputRef.current?.select();
    } else if (!open && wasOpen.current) {
      const opener = openerRef.current;
      if (opener !== null && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
      openerRef.current = null;
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) {
        return;
      }
      event.preventDefault();
      dispatch({ type: 'create-close' });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, dispatch]);

  // A rejected name is the only thing blocking creation, so put the caret back.
  useEffect(() => {
    if (error === null) {
      return;
    }
    nameInputRef.current?.focus({ preventScroll: true });
    nameInputRef.current?.select();
  }, [error]);

  const close = (): void => {
    dispatch({ type: 'create-close' });
  };

  // Connected windows create the profile on the Dashboard (fresh credentials),
  // then write its appearance and select it.
  const submitRemote = async (): Promise<void> => {
    const dashboard = window.mosbot?.dashboard;
    const name = create.name.trim();
    if (dashboard === undefined || name === '') {
      return;
    }
    dispatch({ type: 'create-busy', busy: true });
    const result = await dashboard.createBot({
      name,
      shape: create.shape,
      color: create.color,
    });
    if (!result.ok) {
      const duplicate = /exist|already/i.test(result.error.message);
      dispatch({
        type: 'create-remote-error',
        message: duplicate ? t('create.error.duplicate') : t('create.error.remote'),
      });
      return;
    }
    dispatch({ type: 'remote-upsert-bot', bot: result.data.bot });
    dispatch({
      type: 'remote-model-ready',
      profile: result.data.bot.profileName,
      ready: result.data.modelReady,
    });
    dispatch({ type: 'create-close' });
  };

  const onScrimMouseDown = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) {
      close();
    }
  };

  // Keep Tab inside the dialog: from the first control back to the last enabled
  // one and from the last back to the name field.
  const onDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab') {
      return;
    }
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open) {
    return null;
  }

  const previewStyle: CSSProperties = {
    backgroundImage: `radial-gradient(120% 130% at 50% 18%, color-mix(in srgb, ${create.color} 28%, transparent), transparent 72%)`,
  };
  const describedBy = error === null ? NAME_COUNT_ID : `${NAME_COUNT_ID} ${ERROR_ID}`;

  return (
    <div className={styles.scrim} onMouseDown={onScrimMouseDown}>
      <div
        ref={dialogRef}
        id="create-bot-dialog"
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onKeyDown={onDialogKeyDown}
      >
        <h2 id={TITLE_ID} className={styles.title}>
          {t('create.title')}
        </h2>

        <div className={styles.preview} style={previewStyle} aria-hidden="true">
          <BotLookFace
            shape={create.shape}
            color={create.color}
            seed={seed}
            size={88}
            presence="idle"
          />
        </div>

        <form
          className={styles.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (remoteMode) {
              void submitRemote();
              return;
            }
            dispatch({ type: 'create-submit' });
          }}
        >
          <div className={styles.field}>
            <label className={styles.label} htmlFor={NAME_INPUT_ID}>
              {t('create.name')}
            </label>
            <div className={styles.nameRow}>
              <input
                ref={nameInputRef}
                id={NAME_INPUT_ID}
                className={styles.nameInput}
                type="text"
                value={create.name}
                maxLength={MAX_NAME_LENGTH}
                placeholder={t('create.namePlaceholder')}
                autoComplete="off"
                spellCheck={false}
                aria-describedby={describedBy}
                aria-invalid={error !== null}
                onChange={(event) => {
                  dispatch({ type: 'create-name', name: event.target.value });
                }}
                onKeyDown={(event) => {
                  // Enter belongs to the IME while a composition is in flight.
                  if (event.key === 'Enter' && event.nativeEvent.isComposing) {
                    event.preventDefault();
                  }
                }}
              />
              <span id={NAME_COUNT_ID} className={styles.nameCount}>
                {t('create.nameCount', { count: create.name.length })}
              </span>
            </div>
            {error === null ? null : (
              <p id={ERROR_ID} className={styles.error} role="alert">
                {t(ERROR_KEYS[error])}
              </p>
            )}
            {create.remoteError === null ? null : (
              <p className={styles.error} role="alert">
                {create.remoteError}
              </p>
            )}
          </div>

          <fieldset className={styles.fieldGroup}>
            <legend className={styles.label}>{t('create.shape')}</legend>
            <div className={styles.chips}>
              {BOT_SHAPES.map((shape) => (
                <label key={shape} className={styles.chipOption}>
                  <input
                    type="radio"
                    name="bot-shape"
                    value={shape}
                    className="visually-hidden"
                    checked={create.shape === shape}
                    onChange={() => {
                      dispatch({ type: 'create-shape', shape });
                    }}
                  />
                  <span className={styles.chip}>{t(SHAPE_KEYS[shape])}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.fieldGroup}>
            <legend className={styles.label}>{t('create.color')}</legend>
            <div className={styles.swatches}>
              {SWATCHES.map((swatch, index) => (
                <label key={swatch} className={styles.swatchOption}>
                  <input
                    type="radio"
                    name="bot-color"
                    value={swatch}
                    className="visually-hidden"
                    checked={normalizeColor(create.color) === swatch}
                    aria-label={t('create.colorSwatch', { index: index + 1 })}
                    onChange={() => {
                      dispatch({ type: 'create-color', color: swatch });
                    }}
                  />
                  <span className={styles.swatch} style={{ backgroundColor: swatch }} />
                </label>
              ))}
            </div>
          </fieldset>

          <footer className={styles.footer}>
            <button type="button" className={styles.cancelButton} onClick={close}>
              {t('common.cancel')}
            </button>
            <button type="submit" className={styles.submitButton} disabled={!canSubmit}>
              {create.busy ? t('create.creating') : t('create.submit')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
