"""Outbound push is restricted to browser vendors, never arbitrary subscription URLs."""

from urllib.parse import urlsplit

import requests

MAX_PUSH_SUBSCRIPTIONS = 10
PUSH_HOSTS = {
    "fcm.googleapis.com",
    "web.push.apple.com",
    "updates.push.services.mozilla.com",
    "updates-push.services.mozaws.net",
}


def validate_push_endpoint(value: str) -> str:
    # Reject URL-parser normalization, credentials and encoded host tricks. Only vendor-owned
    # DNS names are accepted, so subscribers cannot introduce a rebinding domain or IP literal.
    if any(ord(char) < 33 or ord(char) > 126 for char in value) or "\\" in value:
        raise ValueError("Choose a supported browser push service.")
    try:
        url = urlsplit(value)
        allowed_host = url.hostname in PUSH_HOSTS or (
            url.hostname is not None and url.hostname.endswith(".notify.windows.com")
        )
        valid = (
            url.scheme == "https"
            and allowed_host
            and url.port in {None, 443}
            and url.username is None
            and url.password is None
            and not url.fragment
            and len(url.path) > 1
        )
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("Choose a supported browser push service.")
    return value


class PushSession(requests.Session):
    """Recheck at the transport boundary and never follow a provider redirect."""

    def request(self, method, url, **kwargs):
        validate_push_endpoint(url)
        kwargs["allow_redirects"] = False
        kwargs["verify"] = True
        return super().request(method, url, **kwargs)
