import hashlib, json
from datetime import datetime, timezone
from pwdlib import PasswordHash
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from app.config import settings
from app.models import AuditEvent

password_hash = PasswordHash.recommended()
serializer = URLSafeTimedSerializer(settings.session_secret, salt="trustvault-session-v1")

def hash_password(password: str) -> str:
    return password_hash.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    try:
        return password_hash.verify(password, hashed)
    except Exception:
        return False

def create_session_token(user_id: int) -> str:
    return serializer.dumps({"uid": user_id})

def read_session_token(token: str) -> int | None:
    try:
        data = serializer.loads(token, max_age=60 * 60 * 8)
        uid = data.get("uid")
        return int(uid) if uid is not None else None
    except (BadSignature, SignatureExpired, ValueError, TypeError):
        return None

def _iso_utc(value):
    # SQLite may return naive datetimes even when timezone=True; normalize for stable hashes.
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()

def append_audit(db, actor_id, action, document_id=None, target_user_id=None, outcome="success", details=None):
    previous = db.query(AuditEvent).order_by(AuditEvent.id.desc()).first()
    previous_hash = previous.event_hash if previous else "0" * 64
    created_at = datetime.now(timezone.utc)
    payload = {
        "actor_id": actor_id, "action": action, "document_id": document_id,
        "target_user_id": target_user_id, "outcome": outcome,
        "details": details or {}, "previous_hash": previous_hash,
        "created_at": _iso_utc(created_at)
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    event_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    event = AuditEvent(
        actor_id=actor_id, action=action, document_id=document_id,
        target_user_id=target_user_id, outcome=outcome,
        details_json=json.dumps(details or {}, sort_keys=True),
        previous_hash=previous_hash, event_hash=event_hash, created_at=created_at
    )
    db.add(event)
    db.flush()
    return event

def verify_audit_chain(db):
    events = db.query(AuditEvent).order_by(AuditEvent.id.asc()).all()
    expected_prev = "0" * 64
    for event in events:
        payload = {
            "actor_id": event.actor_id, "action": event.action,
            "document_id": event.document_id, "target_user_id": event.target_user_id,
            "outcome": event.outcome, "details": json.loads(event.details_json or "{}"),
            "previous_hash": event.previous_hash, "created_at": _iso_utc(event.created_at)
        }
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        calculated = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        if event.previous_hash != expected_prev or calculated != event.event_hash:
            return {"valid": False, "checked": event.id, "reason": "hash_or_link_mismatch"}
        expected_prev = event.event_hash
    return {"valid": True, "checked": len(events), "head": expected_prev}
