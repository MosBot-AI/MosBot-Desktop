/**
 * The user's reduced-motion preference as a React store, so faces can fall
 * back to the mood's static pose and follow the system setting while mounted.
 * Subscribing is opt-in: a face with `animated={false}` adds no listener.
 */

const QUERY = '(prefers-reduced-motion: reduce)';

let media: MediaQueryList | null = null;

function mediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }
  if (media === null) {
    media = window.matchMedia(QUERY);
  }
  return media;
}

/** Whether the user asked the system for reduced motion; false where the API is unavailable. */
export function getReducedMotion(): boolean {
  return mediaQuery()?.matches ?? false;
}

/** Calls `onChange` when the system preference changes; the returned function removes the listener. */
export function subscribeReducedMotion(onChange: () => void): () => void {
  const query = mediaQuery();
  if (query === null) {
    return () => undefined;
  }
  query.addEventListener('change', onChange);
  return (): void => {
    query.removeEventListener('change', onChange);
  };
}
