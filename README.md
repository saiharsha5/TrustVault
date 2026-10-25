# TrustVault — Secure Document Sharing

TrustVault is a starter implementation of per-document access control and tamper-evident audit events.

## Stack
- FastAPI + SQLAlchemy 2 + Alembic
- PostgreSQL
- React + Vite + TypeScript (frontend scaffold)
- Private local file storage for development
- Argon2 password hashing, signed server-side session cookie
- Hash-chained audit events

> This is a development starter, not a production security certification. Before production, add TLS, rate limiting, email verification/password reset, robust session revocation, malware scanning, object storage with private ACLs, backup/restore drills, and independent security review.

## Quick start (Docker)
1. Install Docker Desktop.
2. Copy `.env.example` to `.env`.
3. Change `SESSION_SECRET` to a long random secret.
4. Run: `docker compose up --build`
5. API docs: http://localhost:8000/docs
6. Health: http://localhost:8000/health

The React frontend scaffold is in `frontend/`. To run it separately:
```bash
cd frontend
npm install
npm run dev
```
Set `VITE_API_BASE=http://localhost:8000` if needed.

## Demo bootstrap
When `BOOTSTRAP_DEMO=true`, startup creates demo users if they do not exist:
- `admin@trustvault.local`
- `owner@trustvault.com`
- `viewer@trustvault.local`

Set `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_OWNER_PASSWORD`, and `BOOTSTRAP_VIEWER_PASSWORD` in `.env` before starting. These are development demo accounts; never use shared/demo credentials in production. The application does not print passwords to logs.

## Core security behavior
- Documents are stored outside public/static web directories.
- Each file metadata and download request checks the user's current permission in the database.
- Granting and revoking access creates audit events.
- Audit records are hash-chained using SHA-256.
- Admin role alone does not automatically grant access to document contents.
- Only document owners can grant/revoke document access.
- A viewer can only fetch documents with an active grant or ownership.
- Upload limits and filename normalization are enforced.

## Tests
Run locally:
```bash
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS/Linux:
source .venv/bin/activate
pip install -r requirements.txt
pytest -q
```
The tests use SQLite and a temporary storage folder. They do not prove the entire system is secure; review `THREATS.md` and test the running deployment.

## API outline
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /documents` (multipart upload)
- `GET /documents`
- `GET /documents/{id}`
- `GET /documents/{id}/download`
- `POST /documents/{id}/grants`
- `GET /documents/{id}/grants`
- `DELETE /documents/{id}/grants/{user_id}`
- `GET /audit/events` (admin)
- `GET /audit/verify` (admin)

## Known limitations
- Development local storage; use private S3-compatible storage with carefully scoped permissions for production.
- Cookie sessions are signed and expire, but there is no server-side session registry yet. For immediate logout/revocation across devices, add session records and rotate/revoke them.
- Hash chains detect changes to records in the chain, but an attacker who controls the database and signing environment may rewrite the entire chain. Add periodic externally stored checkpoints and separate privileges for stronger evidence.
- Download access is authorized when the request begins. For very large files/streaming, use chunk-aware authorization or a controlled proxy so long transfers can be stopped after revocation.
