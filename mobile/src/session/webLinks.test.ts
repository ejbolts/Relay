import { friendInviteLink } from '../../../frontend/src/friendInviteLink';
import { redirectSystemPath } from '../app/+native-intent';
import { memoryKv } from '../testing/memoryKvStore';
import { webLinkRoute } from './webLinks';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../testing/memoryKvStore'));
jest.mock('expo-router', () => ({}));

const id = 'd7131000-7937-40be-b8ee-8b02800f5a36';
const invite = `/social/profile/${id}?invite=1`;

describe('web links', () => {
  it.each(['https://gym.example.com', 'http://127.0.0.1:8000', 'https://relay.example.org:8443'])(
    'opens the invite a friend QR code holds, from %s',
    (origin) => {
      expect(webLinkRoute(friendInviteLink(id, origin))).toEqual({
        route: invite,
        friend: id,
        registrationCode: null,
      });
      expect(webLinkRoute(friendInviteLink(id, origin, 'open sesame'))).toEqual({
        route: invite,
        friend: id,
        registrationCode: 'open sesame',
      });
    },
  );

  it('keeps the friend link when its registration code is malformed', () => {
    expect(webLinkRoute(`https://gym.example.com/#friend=${id}&invite=%`)).toEqual({
      route: invite,
      friend: id,
      registrationCode: null,
    });
  });

  it.each([
    ['https://gym.example.com/', '/'],
    ['https://gym.example.com', '/'],
    ['https://gym.example.com/#dashboard', '/'],
    ['https://gym.example.com/#log', '/workout'],
    ['https://gym.example.com/#body', '/body'],
    ['https://gym.example.com/#training', '/training'],
    ['https://gym.example.com/#social', '/social'],
    ['https://gym.example.com/#shared', '/social'],
    ['https://gym.example.com/#shared-profile', '/social'],
    ['https://gym.example.com/#profile', '/social'],
    ['https://gym.example.com/#videos', '/videos'],
    ['https://gym.example.com/?youtube=connected#videos', '/videos'],
    ['https://gym.example.com/#settings', '/settings'],
    ['https://gym.example.com/#split', '/split'],
    ['https://gym.example.com/#admin', '/admin'],
    [`https://gym.example.com/?admin-account=${id}#admin`, `/admin/account/${id}`],
    ['https://gym.example.com/?admin-account=../x#admin', '/admin'],
    ['https://gym.example.com/#unknown-screen', '/'],
    ['https://gym.example.com/somewhere/else', '/'],
  ])('opens %s at %s', (url, route) => {
    expect(webLinkRoute(url)?.route).toBe(route);
  });

  it.each([
    ['history', 'sessions'],
    ['progress', 'exercises'],
    ['cardio', 'cardio'],
  ])('opens #%s at Training’s %s section, even when Training is open', (tab, section) => {
    const route = webLinkRoute(`https://gym.example.com/#${tab}`)?.route;
    expect(route).toMatch(new RegExp(`^/training\\?section=${section}&request=\\d+$`));
  });

  it('reads a web link on the app’s own scheme', () => {
    expect(webLinkRoute(`relay-mobile:///#friend=${id}`)?.route).toBe(invite);
    expect(webLinkRoute(`relay-mobile://#friend=${id}`)?.route).toBe(invite);
    expect(webLinkRoute(`exp://127.0.0.1:8081/--/#friend=${id}`)?.route).toBe(invite);
    expect(webLinkRoute('relay-mobile:///#social')?.route).toBe('/social');
  });

  it('leaves app routes to the router', () => {
    expect(webLinkRoute(`relay-mobile://social/profile/${id}?invite=1`)).toBeNull();
    expect(webLinkRoute('relay-mobile://settings')).toBeNull();
    expect(webLinkRoute('relay-mobile://')).toBeNull();
    expect(webLinkRoute('exp://127.0.0.1:8081/--/social')).toBeNull();
    expect(webLinkRoute('/social')).toBeNull();
    expect(webLinkRoute('mailto:someone@example.com')).toBeNull();
  });
});

describe('system links', () => {
  beforeEach(() => memoryKv.clear());

  it('opens a web friend link as the app’s invite and keeps it with its code for sign-up', () => {
    const link = friendInviteLink(id, 'https://gym.example.com', 'sample-code');
    expect(redirectSystemPath({ path: link, initial: true })).toBe(invite);
    expect(memoryKv.get('relay.pendingFriendInvite')).toBe(JSON.stringify(id));
    expect(memoryKv.get('relay.pendingRegistrationInvite')).toBe(JSON.stringify('sample-code'));
    // A later friend's link without a code replaces it, as on the web.
    redirectSystemPath({
      path: friendInviteLink('other', 'https://gym.example.com'),
      initial: false,
    });
    expect(memoryKv.get('relay.pendingFriendInvite')).toBe(JSON.stringify('other'));
    expect(memoryKv.has('relay.pendingRegistrationInvite')).toBe(false);
    // So does an app invite link, which never carries a code.
    redirectSystemPath({ path: link, initial: false });
    expect(memoryKv.get('relay.pendingRegistrationInvite')).toBe(JSON.stringify('sample-code'));
    redirectSystemPath({ path: 'relay-mobile://social/profile/third?invite=1', initial: false });
    expect(memoryKv.has('relay.pendingRegistrationInvite')).toBe(false);
  });

  it('passes app links through and keeps the YouTube return out of navigation', () => {
    expect(redirectSystemPath({ path: 'relay-mobile://settings', initial: false })).toBe(
      'relay-mobile://settings',
    );
    expect(
      redirectSystemPath({
        path: 'relay-mobile://youtube-return?youtube=connected',
        initial: false,
      }),
    ).toBeNull();
    expect(
      redirectSystemPath({
        path: 'relay-mobile://youtube-return?youtube=connected',
        initial: true,
      }),
    ).toBe('/settings/youtube?attempt=lost');
    expect(redirectSystemPath({ path: 'https://gym.example.com/#videos', initial: true })).toBe(
      '/videos',
    );
  });
});
