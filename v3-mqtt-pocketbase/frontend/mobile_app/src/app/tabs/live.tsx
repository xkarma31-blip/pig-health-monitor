import React from 'react';
import { Redirect } from 'expo-router';
import { LEGACY_LIVE_REDIRECT_HREF } from '../../utils/history-navigation';

/**
 * The retired Live tab. Deep links, stale bookmarks and any remaining
 * `/tabs/live` navigation still land here, so this route now forwards to the
 * Live section of the History tab, which hosts the old Live view.
 *
 * The route itself is kept (not deleted) so the tab trigger registered in
 * `_layout.tsx` and any external link keep resolving instead of 404-ing.
 */
export default function LegacyLiveRedirect() {
  return <Redirect href={LEGACY_LIVE_REDIRECT_HREF} />;
}
