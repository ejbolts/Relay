import { appTabFromHash, type AppTab } from '../../../frontend/src/appNavigation';
import {
  friendInviteIdFromHash,
  registrationInviteFromHash,
} from '../../../frontend/src/friendInviteLink';
import { trainInviteTokenFromHash } from '../../../frontend/src/trainTogether';

/**
 * Where a link to the web app opens in this app. The web is one page at the server's root, so its
 * links name their screen in the fragment: a friend's QR code is `/#friend=<id>&invite=<code>`
 * and other screens are `/#<screen>` (as alerts send). Universal links and App Links hand these to
 * the app unchanged; a web link on the app's own scheme (`relay-mobile:///#friend=<id>`) opens
 * the same way.
 */
export interface WebLink {
  route: string;
  /** A friend link's account, which opens their profile's invite. */
  friend?: string;
  /** The registration code a friend link carries for a closed server. */
  registrationCode?: string | null;
  /** A train-together code (`/#train=<token>`), joined once signed in. */
  train?: string;
}

const WEB_LINK =
  /^(?:https?:\/\/[^/?#]+|relay-mobile:\/\/|exps?:\/\/[^/?#]+\/--)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i;

/** The app's screen for each web screen. Screens the app shows elsewhere open the nearest one. */
const TAB_ROUTES: Record<AppTab, string> = {
  dashboard: '/',
  log: '/workout',
  body: '/body',
  training: '/training',
  history: '/training?section=sessions',
  progress: '/training?section=exercises',
  cardio: '/training?section=cardio',
  social: '/social',
  'shared-profile': '/social',
  profile: '/social',
  videos: '/videos',
  settings: '/settings',
  split: '/split',
  admin: '/admin',
};

function queryParam(search: string | undefined, name: string): string | null {
  if (!search) return null;
  try {
    return new URLSearchParams(search.slice(1)).get(name);
  } catch {
    return null;
  }
}

/**
 * Reads a link to the web app. Links that already name an app route (`relay-mobile://social`)
 * and links to anything but the web app's root are left to the router.
 */
export function webLinkRoute(url: string): WebLink | null {
  const parts = WEB_LINK.exec(url.trim());
  if (!parts) return null;
  const [, rawPath = '', search, hash = ''] = parts;
  const path = rawPath.replace(/\/+$/, '');
  const web = /^https?:/i.test(url.trim());
  // The app's own links with a path are app routes, not web links.
  if (path !== '' && !web) return null;
  if (path !== '') return web ? { route: '/' } : null;
  const friend = friendInviteIdFromHash(hash);
  if (friend) {
    return {
      route: `/social/profile/${encodeURIComponent(friend)}?invite=1`,
      friend,
      registrationCode: registrationInviteFromHash(hash),
    };
  }
  // Train together: the code is joined by the signed-in app wherever it is; Home underneath.
  const train = trainInviteTokenFromHash(hash);
  if (train) return { route: '/', train };
  if (!web && !hash) return null;
  const tab = appTabFromHash(hash);
  // An alert for an account's password request (`/?admin-account=<id>#admin`).
  const account = tab === 'admin' ? queryParam(search, 'admin-account') : null;
  if (account && /^[A-Za-z0-9-]{1,64}$/.test(account))
    return { route: `/admin/account/${encodeURIComponent(account)}` };
  const route = TAB_ROUTES[tab];
  // Each request switches an open Training tab too, as `trainingRoute` does.
  return { route: route.includes('section=') ? `${route}&request=${Date.now()}` : route };
}
