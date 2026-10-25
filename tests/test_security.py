def register(client, email, password="long-enough-test-password"):
    r = client.post("/auth/register", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    return r.json()

def login(client, email, password="long-enough-test-password"):
    r = client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text

def test_unauthenticated_upload_denied(client):
    r = client.post("/documents", files={"file": ("x.txt", b"secret", "text/plain")})
    assert r.status_code == 401

def test_owner_upload_and_viewer_grant_then_revoke(client):
    owner = register(client, "owner@example.com")
    register(client, "viewer@example.com")
    login(client, "owner@example.com")
    uploaded = client.post("/documents", files={"file": ("secret.txt", b"confidential", "text/plain")})
    assert uploaded.status_code == 201, uploaded.text
    doc_id = uploaded.json()["id"]
    client.post("/auth/logout")
    login(client, "viewer@example.com")
    assert client.get(f"/documents/{doc_id}/download").status_code == 404
    client.post("/auth/logout")
    login(client, "owner@example.com")
    granted = client.post(f"/documents/{doc_id}/grants", json={"email": "viewer@example.com"})
    assert granted.status_code == 201, granted.text
    client.post("/auth/logout")
    login(client, "viewer@example.com")
    assert client.get(f"/documents/{doc_id}/download").status_code == 200
    client.post("/auth/logout")
    login(client, "owner@example.com")
    # Identify the viewer id from the owner-visible grants list.
    grants = client.get(f"/documents/{doc_id}/grants").json()
    viewer = next(g for g in grants if g["email"] == "viewer@example.com")
    assert client.delete(f"/documents/{doc_id}/grants/{viewer['user_id']}").status_code == 200
    client.post("/auth/logout")
    login(client, "viewer@example.com")
    assert client.get(f"/documents/{doc_id}/download").status_code == 404

def test_admin_cannot_read_document_without_grant(client):
    register(client, "admin@example.com")
    register(client, "owner2@example.com")
    # Promote admin using the test DB directly.
    from app.db import SessionLocal
    from app.models import User
    with SessionLocal() as db:
        user = db.query(User).filter_by(email="admin@example.com").first()
        user.role = "admin"
        db.commit()
    login(client, "owner2@example.com")
    uploaded = client.post("/documents", files={"file": ("private.txt", b"private", "text/plain")})
    doc_id = uploaded.json()["id"]
    client.post("/auth/logout")
    login(client, "admin@example.com")
    assert client.get(f"/documents/{doc_id}/download").status_code == 404
    assert client.get("/audit/events").status_code == 200

def test_audit_chain_verifies(client):
    register(client, "audit@example.com")
    login(client, "audit@example.com")
    assert client.get("/auth/me").status_code == 200
    from app.db import SessionLocal
    from app.security import verify_audit_chain
    with SessionLocal() as db:
        result = verify_audit_chain(db)
        assert result["valid"] is True
        assert result["checked"] >= 2

def test_upload_rejects_file_over_size_limit(client, monkeypatch):
    from app.main import settings

    register(client, "sizetest@example.com")
    login(client, "sizetest@example.com")

    # Set a small limit for this test only.
    monkeypatch.setattr(settings, "max_upload_bytes", 10)

    response = client.post(
        "/documents",
        files={"file": ("large.txt", b"A" * 11, "text/plain")},
    )

    assert response.status_code == 413
    assert response.json()["detail"] == "File exceeds configured upload limit"


def test_upload_sanitizes_filename(client):
    register(client, "filenametest@example.com")
    login(client, "filenametest@example.com")

    response = client.post(
        "/documents",
        files={"file": ("../../my secret?.txt", b"safe content", "text/plain")},
    )

    assert response.status_code == 201, response.text

    # The original filename must not contain directory traversal.
    uploaded_name = response.json()["name"]
    assert "/" not in uploaded_name
    assert "\\" not in uploaded_name
    assert ".." not in uploaded_name
