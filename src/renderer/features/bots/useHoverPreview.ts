import { useCallback, useEffect, useRef, useState } from 'react';

export interface HoverCardPosition {
  readonly top: number;
  readonly left: number;
}

const CARD_WIDTH = 264;
const CARD_HEIGHT_ESTIMATE = 104;
const GAP = 10;
const VIEWPORT_MARGIN = 12;
const SHOW_DELAY_MS = 260;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

export interface HoverPreview {
  readonly anchorRef: (element: HTMLElement | null) => void;
  readonly hovered: boolean;
  readonly position: HoverCardPosition | null;
  readonly onEnter: () => void;
  readonly onLeave: () => void;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
}

/**
 * Pointer/focus hover preview for a roster item: shows a small card beside the
 * row after a short delay, hides on leave, scroll or window resize. The anchor
 * may sit inside the 288 px sidebar, so the card is placed to its right (or to
 * the left when there is no room) as a fixed layer over the chat.
 */
export function useHoverPreview(): HoverPreview {
  const elementRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [position, setPosition] = useState<HoverCardPosition | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setHovered(false);
    setPosition(null);
  }, [clearTimer]);

  const computePosition = useCallback((): HoverCardPosition | null => {
    const element = elementRef.current;
    if (element === null) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    const preferredLeft = rect.right + GAP;
    const left =
      preferredLeft + CARD_WIDTH > window.innerWidth - VIEWPORT_MARGIN
        ? clamp(
            rect.left - CARD_WIDTH - GAP,
            VIEWPORT_MARGIN,
            window.innerWidth - CARD_WIDTH - VIEWPORT_MARGIN,
          )
        : preferredLeft;
    const top = clamp(
      rect.top + rect.height / 2 - CARD_HEIGHT_ESTIMATE / 2,
      VIEWPORT_MARGIN,
      window.innerHeight - CARD_HEIGHT_ESTIMATE - VIEWPORT_MARGIN,
    );
    return { top, left };
  }, []);

  const show = useCallback(() => {
    const next = computePosition();
    if (next === null) {
      return;
    }
    setHovered(true);
    setPosition(next);
  }, [computePosition]);

  const anchorRef = useCallback((element: HTMLElement | null) => {
    elementRef.current = element;
  }, []);

  // The face reacts as soon as the pointer arrives; only the card waits briefly
  // so moving across a list does not flash previews.
  const onEnter = useCallback(() => {
    setHovered(true);
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      show();
    }, SHOW_DELAY_MS);
  }, [clearTimer, show]);

  const onFocus = useCallback(() => {
    setHovered(true);
    clearTimer();
    show();
  }, [clearTimer, show]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (position === null) {
      return;
    }
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [position, hide]);

  return {
    anchorRef,
    hovered,
    position,
    onEnter,
    onLeave: hide,
    onFocus,
    onBlur: hide,
  };
}
