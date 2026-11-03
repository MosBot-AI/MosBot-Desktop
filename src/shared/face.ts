import type { Presence } from './domain';

/**
 * Face moods ported from the MosBot mobile client. Desktop statuses map onto
 * these so the eyes move with real session, approval and connection state.
 */
export type FaceMood =
  | 'sleep'
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'typing'
  | 'working'
  | 'screen'
  | 'waiting'
  | 'watching'
  | 'done'
  | 'oops';

export function faceMoodForPresence(presence: Presence): FaceMood {
  switch (presence) {
    case 'idle':
      return 'idle';
    case 'working':
      return 'working';
    case 'replying':
      return 'typing';
    case 'needs-confirmation':
      return 'waiting';
    case 'offline':
      return 'sleep';
  }
}
