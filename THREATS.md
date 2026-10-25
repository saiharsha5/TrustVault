# TrustVault Threat Model

Status labels: `Implemented`, `Partial`, `Planned`. Re-run tests and update evidence before claiming a control is verified.

| Threat | Impact | Current mitigation | Status |
|---|---|---|---|
| Unauthorized document download | Confidentiality breach | Authorization checked on each download | Implemented |
| Access after grant revocation | Confidentiality breach | Grant active flag checked from DB on each request | Implemented |
| Admin reads files by role alone | Privilege abuse | Admin role does not imply document grant | Implemented |
| Password database disclosure | Account takeover | Argon2 password hashes | Implemented |
| Session theft | Account takeover | HttpOnly cookie, bounded token age | Partial: no server-side session revocation |
| Brute-force login | Account takeover | None yet | Planned: rate limit and lockout |
| Cross-site request forgery | Unauthorized state change | SameSite=Lax cookie; no CSRF token yet | Partial |
| Cross-site scripting | Session or data theft | React escapes text; CSP not configured | Partial |
| SQL injection | Data disclosure/modification | SQLAlchemy parameterized queries | Partial: review all raw SQL before release |
| Path traversal upload | File overwrite/disclosure | Random storage names, basename sanitation | Implemented |
| Oversized upload / disk exhaustion | Service outage | Configurable byte limit | Partial: add rate limits and disk quotas |
| Malicious uploaded file | Malware execution or user harm | No scanning yet | Planned |
| Public storage exposure | Confidentiality breach | Private directory, no static mount | Implemented for local development |
| Predictable file IDs | Unauthorized discovery | Authorization still required; sequential IDs | Partial: use UUIDs if needed |
| Audit row modification | Loss of evidence | SHA-256 hash chain and verification endpoint | Partial: DB owner can rewrite full chain |
| Audit event deletion | Loss of evidence | Chain verification detects gaps when records remain linked | Partial: external checkpoints needed |
| Audit event spoofing | Misleading records | Server creates events | Partial: protect DB/app credentials |
| Secret committed to repository | Account compromise | `.env` ignored | Partial: use secret scanning |
| Insecure transport | Credential/file exposure | Local HTTP only | Planned: TLS in deployment |
| CORS misconfiguration | Browser cross-origin abuse | Localhost dev origin only | Partial: restrict exact production origin |
| Email enumeration | Privacy leak | Registration reports duplicate email | Partial |
| Weak password | Account takeover | 12-character minimum | Partial: breached-password checks |
| Orphaned files after DB error | Storage waste | Basic cleanup for upload failure | Partial |
| Concurrent audit writes | Invalid chain order | No serialized chain lock yet | Planned: transaction locking or dedicated append service |
| Incomplete download logging | Audit ambiguity | Event on download request | Partial: delivery success not confirmed |
| Download after access revoked mid-stream | Access after revocation | Permission checked at request start | Partial: stream/chunk-aware authorization |
| Backup theft | Data breach | No backup policy | Planned: encrypted backups |
| Database compromise | Full data compromise | No row-level encryption | Planned: least-privilege DB roles, encryption at rest |
| User role escalation | Admin compromise | Public registration always creates user role | Partial: restrict role management to controlled admin workflow |
| Sensitive metadata leakage | Privacy breach | Basic metadata only to authorized users | Partial: review logging and responses |
| Dependency vulnerability | Exploitation | Pinned direct dependencies | Planned: automated dependency scanning |
