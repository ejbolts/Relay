from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.models import Friendship, ProfileBlock, ProfileSharing, User, utc_now


def add_members(password_hash: str, count: int) -> list[str]:
    with SessionLocal() as db:
        members = [
            User(
                username=f"suggestion_{index}",
                display_name=f"Person {index:02}",
                password_hash=password_hash,
            )
            for index in range(count)
        ]
        db.add_all(members)
        db.flush()
        db.add_all(ProfileSharing(user_id=member.id, visibility="public") for member in members)
        db.commit()
        return [member.id for member in members]


def test_suggestions_page_eight_public_non_friends_and_clamp_after_request(
    client, fixture_password_hash
):
    client.put("/api/sharing", json={"visibility": "followers"})
    ids = add_members(fixture_password_hash, 17)
    pages = [client.get("/api/sharing/suggestions", params={"page": page}) for page in (1, 2, 3)]
    assert all(response.status_code == 200 for response in pages)
    data = [response.json() for response in pages]
    assert [len(page["profiles"]) for page in data] == [8, 8, 1]
    assert [page["page"] for page in data] == [1, 2, 3]
    assert all(page["page_size"] == 8 and page["total"] == 17 for page in data)
    assert [person["id"] for page in data for person in page["profiles"]] == ids
    assert all(
        person["friend_status"] == "none"
        and person["visibility"] == "public"
        and person["can_view"]
        and person["username"] == f"suggestion_{ids.index(person['id'])}"
        for page in data
        for person in page["profiles"]
    )
    assert client.get("/api/sharing/suggestions", params={"page": 999}).json() == data[-1]
    assert client.get("/api/sharing/suggestions", params={"page": 0}).status_code == 422

    # Sending a request removes the member and corrects the now-empty final page.
    assert client.post(f"/api/sharing/friends/{ids[-1]}").is_success
    page = client.get("/api/sharing/suggestions", params={"page": 3}).json()
    assert page["page"] == 2 and page["total"] == 16
    assert [person["id"] for person in page["profiles"]] == ids[8:16]
    assert client.delete(f"/api/sharing/friends/{ids[-1]}").is_success
    assert client.get("/api/sharing/suggestions", params={"page": 3}).json() == data[-1]


def test_suggestions_exclude_private_disabled_blocks_and_all_relationships(
    client, other_client, fixture_password_hash
):
    ids = add_members(fixture_password_hash, 8)
    owner = client.user["id"]
    with SessionLocal() as db:
        db.get(ProfileSharing, ids[0]).visibility = "private"
        db.get(ProfileSharing, ids[1]).visibility = "followers"
        db.get(User, ids[2]).disabled_at = utc_now()
        db.add(ProfileBlock(blocker_id=owner, blocked_id=ids[3]))
        db.add(ProfileBlock(blocker_id=ids[4], blocked_id=owner))
        for other, requester, status in (
            (ids[5], owner, "pending"),
            (ids[6], ids[6], "pending"),
            (other_client.user["id"], owner, "accepted"),
        ):
            first, second = sorted((owner, other))
            db.add(
                Friendship(
                    member_a_id=first,
                    member_b_id=second,
                    requested_by_id=requester,
                    status=status,
                )
            )
        db.commit()
    page = client.get("/api/sharing/suggestions").json()
    assert page["total"] == 1
    assert [person["id"] for person in page["profiles"]] == [ids[7]]
    # A later privacy change is reflected without exposing a stale suggestion.
    with SessionLocal() as db:
        db.get(ProfileSharing, ids[7]).visibility = "private"
        db.commit()
    assert client.get("/api/sharing/suggestions").json() == {
        "profiles": [],
        "total": 0,
        "page": 1,
        "page_size": 8,
    }
    client.put("/api/sharing", json={"visibility": "private"})
    response = client.get("/api/sharing/suggestions")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "sharing_required"


def test_suggestions_require_authentication(anonymous_client: TestClient):
    assert anonymous_client.get("/api/sharing/suggestions").status_code == 401
