import hashlib
import os
import re
import secrets
import json
from pathlib import Path

from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Response,
    Request,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.config import settings
from app.db import Base, engine, get_db, SessionLocal
from app.models import User, Document, DocumentGrant, AuditEvent
from app.schemas import RegisterIn, LoginIn, UserOut, GrantIn, GrantOut
from app.security import (
    hash_password,
    verify_password,
    create_session_token,
    append_audit,
    verify_audit_chain,
)
from app.deps import current_user, admin_user, COOKIE_NAME


app = FastAPI(
    title="TrustVault API",
    version="0.1.0",
    description=(
        "Secure document sharing with per-document authorization "
        "and tamper-evident audit events."
    ),
)


# Configurable CORS origins.
# Localhost origins are the defaults for local development.
# In production, set CORS_ORIGINS to your deployed frontend origin.
cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        (
            "http://localhost:5173,"
            "http://127.0.0.1:5173,"
            "http://localhost:3000,"
            "http://127.0.0.1:3000"
        ),
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


STORAGE = Path(settings.storage_dir).resolve()
STORAGE.mkdir(parents=True, exist_ok=True)


def clean_name(name: str) -> str:
    name = Path(name or "document").name
    name = re.sub(r"[^A-Za-z0-9._ -]", "_", name).strip(" .")
    return (name or "document")[:255]


def get_document_access(
    db: Session,
    doc: Document,
    user: User,
) -> bool:
    if doc.owner_id == user.id:
        return True

    grant = db.query(DocumentGrant).filter_by(
        document_id=doc.id,
        user_id=user.id,
        active=True,
    ).first()

    return grant is not None


def require_document_access(
    db: Session,
    doc_id: int,
    user: User,
) -> Document:
    doc = db.get(Document, doc_id)

    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    if not get_document_access(db, doc, user):
        append_audit(
            db,
            user.id,
            "document.access_denied",
            document_id=doc.id,
            outcome="denied",
        )
        db.commit()

        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    return doc


def doc_out(doc: Document, owner_email: str):
    return {
        "id": doc.id,
        "name": doc.original_name,
        "owner_email": owner_email,
        "content_type": doc.content_type,
        "size_bytes": doc.size_bytes,
        "sha256": doc.sha256,
        "created_at": doc.created_at,
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/register", response_model=UserOut, status_code=201)
def register(
    body: RegisterIn,
    db: Session = Depends(get_db),
):
    email = str(body.email).lower()

    if db.query(User).filter_by(email=email).first():
        raise HTTPException(
            status_code=409,
            detail="Email is already registered",
        )

    user = User(
        email=email,
        password_hash=hash_password(body.password),
        role="user",
    )

    db.add(user)
    db.flush()

    append_audit(
        db,
        user.id,
        "user.registered",
        details={"email": email},
    )

    db.commit()
    db.refresh(user)

    return user


@app.post("/auth/login")
def login(
    body: LoginIn,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
):
    email = str(body.email).lower()
    user = db.query(User).filter_by(email=email).first()

    if not user or not verify_password(
        body.password,
        user.password_hash,
    ):
        append_audit(
            db,
            None,
            "auth.login",
            outcome="failure",
            details={"email": email},
        )
        db.commit()

        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    response.set_cookie(
        COOKIE_NAME,
        create_session_token(user.id),
        httponly=True,
        secure=settings.session_https_only,
        samesite="none" if settings.session_https_only else "lax",
        max_age=60 * 60 * 8,
        path="/",
    )

    append_audit(
        db,
        user.id,
        "auth.login",
        details={
            "ip": request.client.host if request.client else None
        },
    )

    db.commit()

    return {
        "message": "Login successful",
        "user": UserOut.model_validate(user).model_dump(
            mode="json"
        ),
    }


@app.post("/auth/logout")
def logout(
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    append_audit(db, user.id, "auth.logout")
    db.commit()

    response.delete_cookie(COOKIE_NAME, path="/")

    return {"message": "Logged out"}


@app.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@app.post("/documents", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    name = clean_name(file.filename or "document")
    stored = secrets.token_hex(24)
    path = STORAGE / stored

    total = 0
    digest = hashlib.sha256()

    try:
        with path.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)

                if not chunk:
                    break

                total += len(chunk)

                if total > settings.max_upload_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail="File exceeds configured upload limit",
                    )

                digest.update(chunk)
                out.write(chunk)

    except Exception:
        path.unlink(missing_ok=True)
        raise

    doc = Document(
        owner_id=user.id,
        original_name=name,
        stored_name=stored,
        content_type=(
            file.content_type or "application/octet-stream"
        ),
        size_bytes=total,
        sha256=digest.hexdigest(),
    )

    db.add(doc)
    db.flush()

    append_audit(
        db,
        user.id,
        "document.uploaded",
        document_id=doc.id,
        details={
            "name": name,
            "size_bytes": total,
            "sha256": doc.sha256,
        },
    )

    db.commit()
    db.refresh(doc)

    return doc_out(doc, user.email)


@app.get("/documents")
def list_documents(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    docs = (
        db.query(Document)
        .join(User, Document.owner_id == User.id)
        .outerjoin(
            DocumentGrant,
            DocumentGrant.document_id == Document.id,
        )
        .filter(
            or_(
                Document.owner_id == user.id,
                (
                    (DocumentGrant.user_id == user.id)
                    & (DocumentGrant.active.is_(True))
                ),
            )
        )
        .distinct()
        .all()
    )

    return [
        doc_out(doc, doc.owner.email)
        for doc in docs
    ]


@app.get("/documents/{document_id}")
def get_document(
    document_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    doc = require_document_access(db, document_id, user)

    append_audit(
        db,
        user.id,
        "document.metadata_viewed",
        document_id=doc.id,
    )
    db.commit()

    return doc_out(doc, doc.owner.email)


@app.get("/documents/{document_id}/download")
def download_document(
    document_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    doc = require_document_access(db, document_id, user)
    path = STORAGE / doc.stored_name

    if not path.is_file():
        append_audit(
            db,
            user.id,
            "document.download",
            document_id=doc.id,
            outcome="storage_missing",
        )
        db.commit()

        raise HTTPException(
            status_code=410,
            detail="Stored file is unavailable",
        )

    append_audit(
        db,
        user.id,
        "document.download",
        document_id=doc.id,
        details={
            "name": doc.original_name,
            "sha256": doc.sha256,
        },
    )
    db.commit()

    return FileResponse(
        path,
        media_type=doc.content_type,
        filename=doc.original_name,
    )

@app.delete("/documents/{document_id}")
def delete_document(
    document_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    doc = db.get(Document, document_id)

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.owner_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the document owner can delete this document",
        )

    stored_path = STORAGE / doc.stored_name

    # Record deletion before removing the document record.
    append_audit(
        db,
        user.id,
        "document.deleted",
        document_id=doc.id,
        details={
            "name": doc.original_name,
            "sha256": doc.sha256,
        },
    )

    # Remove sharing grants associated with this document.
    db.query(DocumentGrant).filter_by(
        document_id=doc.id
    ).delete(synchronize_session=False)

    db.delete(doc)
    db.commit()

    # Remove the private file after the database transaction succeeds.
    stored_path.unlink(missing_ok=True)

    return {"message": "Document deleted successfully"}

@app.post("/documents/{document_id}/grants", status_code=201)
def grant_access(
    document_id: int,
    body: GrantIn,
    owner: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    doc = db.get(Document, document_id)

    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    if doc.owner_id != owner.id:
        raise HTTPException(
            status_code=403,
            detail="Only the document owner can grant access",
        )

    target = db.query(User).filter_by(
        email=str(body.email).lower()
    ).first()

    if not target:
        raise HTTPException(
            status_code=404,
            detail="Target user not found",
        )

    if target.id == owner.id:
        raise HTTPException(
            status_code=400,
            detail="Owner already has access",
        )

    grant = db.query(DocumentGrant).filter_by(
        document_id=doc.id,
        user_id=target.id,
    ).first()

    if grant and grant.active:
        raise HTTPException(
            status_code=409,
            detail="Access is already active",
        )

    if grant:
        grant.active = True
        grant.granted_by = owner.id
    else:
        grant = DocumentGrant(
            document_id=doc.id,
            user_id=target.id,
            granted_by=owner.id,
            active=True,
        )
        db.add(grant)

    append_audit(
        db,
        owner.id,
        "permission.granted",
        document_id=doc.id,
        target_user_id=target.id,
    )

    db.commit()

    return {
        "message": "Access granted",
        "document_id": doc.id,
        "user_email": target.email,
    }


@app.get(
    "/documents/{document_id}/grants",
    response_model=list[GrantOut],
)
def list_grants(
    document_id: int,
    owner: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    doc = db.get(Document, document_id)

    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    if doc.owner_id != owner.id:
        raise HTTPException(
            status_code=403,
            detail="Only the document owner can inspect grants",
        )

    rows = (
        db.query(DocumentGrant, User)
        .join(User, User.id == DocumentGrant.user_id)
        .filter(DocumentGrant.document_id == doc.id)
        .all()
    )

    return [
        {
            "user_id": user.id,
            "email": user.email,
            "active": grant.active,
            "created_at": grant.created_at,
        }
        for grant, user in rows
    ]


@app.delete("/documents/{document_id}/grants/{target_user_id}")
def revoke_access(
    document_id: int,
    target_user_id: int,
    owner: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    doc = db.get(Document, document_id)

    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    if doc.owner_id != owner.id:
        raise HTTPException(
            status_code=403,
            detail="Only the document owner can revoke access",
        )

    grant = db.query(DocumentGrant).filter_by(
        document_id=doc.id,
        user_id=target_user_id,
        active=True,
    ).first()

    if not grant:
        raise HTTPException(
            status_code=404,
            detail="Active grant not found",
        )

    grant.active = False

    append_audit(
        db,
        owner.id,
        "permission.revoked",
        document_id=doc.id,
        target_user_id=target_user_id,
    )

    db.commit()

    return {
        "message": "Access revoked",
        "document_id": doc.id,
        "user_id": target_user_id,
    }


@app.get("/audit/events")
def audit_events(
    limit: int = 100,
    admin: User = Depends(admin_user),
    db: Session = Depends(get_db),
):
    limit = max(1, min(limit, 500))

    events = (
        db.query(AuditEvent)
        .order_by(AuditEvent.id.desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": event.id,
            "actor_id": event.actor_id,
            "action": event.action,
            "document_id": event.document_id,
            "target_user_id": event.target_user_id,
            "outcome": event.outcome,
            "details": json.loads(event.details_json or "{}"),
            "previous_hash": event.previous_hash,
            "event_hash": event.event_hash,
            "created_at": event.created_at,
        }
        for event in events
    ]


@app.get("/audit/verify")
def audit_verify(
    admin: User = Depends(admin_user),
    db: Session = Depends(get_db),
):
    return verify_audit_chain(db)


def bootstrap_demo_users():
    if not settings.bootstrap_demo:
        return

    creds = [
        (
            "admin@trustvault.local",
            settings.bootstrap_admin_password,
            "admin",
        ),
        (
            "owner@trustvault.com",
            settings.bootstrap_owner_password,
            "user",
        ),
        (
            "viewer@trustvault.local",
            settings.bootstrap_viewer_password,
            "user",
        ),
    ]

    with SessionLocal() as db:
        for email, password, role in creds:
            if password and not db.query(User).filter_by(
                email=email
            ).first():
                db.add(
                    User(
                        email=email,
                        password_hash=hash_password(password),
                        role=role,
                    )
                )

        db.commit()


@app.on_event("startup")
def startup():
    # Tables are managed by Alembic in Docker.
    # This keeps direct local testing easy.
    if settings.database_url.startswith("sqlite"):
        Base.metadata.create_all(bind=engine)

    bootstrap_demo_users()