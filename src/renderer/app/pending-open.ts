import type { RemoteBot, Result } from '../../shared/protocol';

export interface PendingOpenDeps {
  /** Profile name carried by the notification click event. */
  readonly profile: string;
  /** Roster currently held by the renderer. */
  readonly bots: readonly RemoteBot[];
  /** Refreshes the roster from `profiles.list`. */
  readonly listBots: () => Promise<Result<readonly RemoteBot[]>>;
  /** Applies a refreshed roster to the store. */
  readonly applyBots: (bots: readonly RemoteBot[]) => void;
  /** Selects the Bot whose approval is waiting. */
  readonly select: (profile: string) => void;
}

/**
 * Opens the Bot referenced by a system-notification click. A Bot created after the
 * roster was loaded (for example by another client) is missing from the renderer
 * roster, so the click must refresh `profiles.list` before selecting it. Returns
 * false when the roster refresh fails or the profile still cannot be found.
 */
export async function openPendingProfile(deps: PendingOpenDeps): Promise<boolean> {
  let bots = deps.bots;
  if (!bots.some((bot) => bot.profileName === deps.profile)) {
    const result = await deps.listBots();
    if (!result.ok) {
      return false;
    }
    bots = result.data;
    deps.applyBots(result.data);
  }
  if (!bots.some((bot) => bot.profileName === deps.profile)) {
    return false;
  }
  deps.select(deps.profile);
  return true;
}
