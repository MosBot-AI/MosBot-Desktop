import type { MessageKey } from '../../app/i18n';
import type { ProtocolError } from '../../../shared/protocol';

/**
 * Maps a Dashboard failure on the artifact library to a specific, human message
 * instead of one generic "could not read". The deployment reports a dangling
 * file/workspace as 404, a sensitive path as 403 and an oversized read as 413;
 * transport keeps the HTTP status on the protocol error for this mapping.
 */
export function artifactErrorKey(error: ProtocolError): MessageKey {
  if (error.code === 'session_expired') {
    return 'inspector.library.error.session';
  }
  if (error.httpStatus === 404) {
    return 'inspector.library.error.notFound';
  }
  if (error.httpStatus === 403) {
    return 'inspector.library.error.denied';
  }
  if (error.httpStatus === 413) {
    return 'inspector.library.error.tooLarge';
  }
  if (error.code === 'unreachable' || error.code === 'timeout') {
    return 'inspector.library.error.offline';
  }
  if (error.code === 'unauthorized') {
    return 'inspector.library.error.signIn';
  }
  return 'inspector.library.remote.error';
}
