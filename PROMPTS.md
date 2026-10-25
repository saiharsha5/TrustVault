# TrustVault AI Prompt / Work Log

Record only actions actually performed. Do not invent test results, commits, or outputs.

## Entry template
- Date:
- Goal:
- Prompt used:
- Files changed:
- Tests run and exact output:
- Security concern reviewed:
- Commit hash / PR:
- Follow-up:

## Starter prompts
1. **Authorization review**  
   "Review every document endpoint in this repository. Create a table of endpoint, required role, ownership/grant check, expected status code, and missing negative test. Do not modify code until you show the findings."

2. **Revocation race analysis**  
   "Analyze whether revoking a grant prevents subsequent requests and what happens to an in-flight download. Propose tests and an implementation that avoids stale permission caches. Clearly distinguish future access from already downloaded copies."

3. **Audit chain review**  
   "Review the canonical serialization used by the audit hash chain. Identify timestamp normalization, concurrency, deletion, and whole-chain rewrite risks. Add tests for tampering and explain what hash chaining does and does not prove."

4. **Threat-driven tests**  
   "For each threat in THREATS.md, map the mitigation to a reproducible test. Add tests for unauthorized access, cross-user document ID guessing, revoked access, admin isolation, upload limits, and audit tampering. Never claim tests passed unless they were run."

5. **Production readiness**  
   "Create a prioritized production-readiness checklist for this FastAPI app covering TLS, CSRF, rate limiting, server-side session revocation, private object storage, malware scanning, backups, secrets, observability, and incident response. Separate blockers from later improvements."
