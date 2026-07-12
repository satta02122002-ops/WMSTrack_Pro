# LogiTrack Pro — Professional Audit Report

_Scope: full-stack review (frontend, backend, data layer, security, performance,
warehouse domain, code quality) with fixes applied where safe without changing
business behaviour._

## Executive summary

LogiTrack Pro is a Vite + React 18 single-page app with an Express + PostgreSQL
backend. It is a **well-organised, readable operations-and-billing tracker** for
3PL/contract-warehouse work: activity execution, storage & handling billing,
VAS, attendance, roles, and audit logging. Since the prior audit it gained real
server-side authentication (JWT + bcrypt), login rate-limiting, and a
record-level sync engine that prevents concurrent clients from clobbering each
other.

The **single most important finding this pass was a privilege-escalation hole**
in the sync endpoint (any authenticated user could rewrite the `users`
collection and promote itself). That is now fixed. The **defining constraint of
the system is its data layer**: the entire application state is one JSONB row.
That keeps the code simple but caps scalability, integrity, and query
performance — it is the main thing to plan around as the product grows.

A first automated **test suite (17 tests)** and a **CI pipeline** were added;
`npm test` and `npm run build` both pass.

## Scores

| Area | Score |
|------|-------|
| Architecture | 68 / 100 |
| Frontend | 82 / 100 |
| Backend | 74 / 100 |
| Database | 45 / 100 |
| Security | 80 / 100 |
| Performance | 66 / 100 |
| Maintainability | 80 / 100 |
| UI / UX | 84 / 100 |
| Warehouse workflow | 62 / 100 |
| Scalability | 50 / 100 |
| Code quality | 78 / 100 |
| **Overall** | **70 / 100** |

## Findings

Status legend: **Fixed** (this pass) · **Mitigated** · **Pending** (documented,
needs a larger decision).

### Critical

**C1 — Privilege escalation via `/api/db/sync`** · _Fixed_
- **Problem:** the sync endpoint accepted any authenticated user's changes to
  any collection, including `users`. A `User`-role account could POST
  `{changes:{users:{upserts:[{id,role:'Developer'}]}}}` and promote itself, or
  deactivate/alter other accounts.
- **Risk:** full authorization bypass / account takeover.
- **Location:** `server/index.js` `POST /api/db/sync`.
- **Root cause:** generic whole-document merge with authentication but no
  per-collection authorization.
- **Fix:** reject any sync payload that touches `users` unless the caller is
  `Admin`/`Developer` (the only roles that legitimately manage users). Normal
  user actions never diff the `users` array, so no legitimate flow is affected.

### High

**H1 — Broad write authorization on sync** · _Mitigated / Pending_
- Any authenticated user can still write non-`users` collections (master data,
  rates, billing) via the API regardless of their UI page access. Page-level
  RBAC is enforced client-side only.
- **Risk:** a low-privilege user could tamper with rates/master data by calling
  the API directly.
- **Recommended path:** move from a single generic sync endpoint to
  resource-scoped endpoints (or a server-side collection→role policy map).
  Deferred because a naive per-collection block would break legitimate flows
  (e.g. a `User` ending an activity legitimately writes `operationsActivities`,
  `storageMovements`, and `auditLog`). The crown-jewel case (`users`) is fixed.

**H2 — `xlsx` dependency has an unpatched high-severity advisory** · _Pending (mitigated)_
- Prototype pollution + ReDoS in SheetJS; `npm audit` reports **no fix
  available** on the npm-published package.
- **Mitigation today:** import is an admin-only action on trusted files.
- **Recommended fix:** install SheetJS from its official distribution
  (`https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`), which is the
  maintained build, or isolate parsing. Not swapped in this pass to avoid an
  untested dependency-source change.

**H3 — No automated tests** · _Fixed_
- Added 17 unit tests (Node's built-in runner, no new dependencies) covering the
  billing engine, the record-level merge, and core utilities. `npm test` wired
  up and green.

### Medium

**M1 — Data layer is a single JSONB document** · _Pending (architectural)_
- No normalization, foreign keys, per-entity indexes, or migration framework;
  integrity lives only in app code. Fine at current scale, but the ceiling for
  querying, reporting, and concurrent write throughput.
- **Recommended path:** migrate high-volume entities (operations, storage
  movements, billed records) to real tables with indexes and FKs; keep
  reference data as-is initially.

**M2 — Whole-document read on every poll + full in-memory state** · _Pending (architectural)_
- Each client holds the entire DB in memory and re-fetches the whole document
  every 5s. Works for thousands of records; won't scale to large datasets.
- **Recommended path:** delta/ETag polling or push (SSE/WebSocket), and
  server-side pagination for history/billing tables.

**M3 — Merge logic mixed into `db.js`** · _Fixed_
- Extracted the pure record-level merge into `server/merge.js` (separation of
  concerns) so it is unit-testable without a database.

**M4 — Dead code / unused exports** · _Fixed_
- Removed unused store actions (`startActivity`, `addActivity`), the defunct
  `prefill`/`setPrefill` hand-off, `storageDaysDefault`, and unused imports.

**M5 — Weak password policy** · _Fixed_
- Now enforced server-side (`validatePassword`): ≥ 8 chars with at least one
  letter and one number, applied on change-password and set-user-password. The
  client mirrors it with live hints. Existing weaker passwords still log in
  until next changed (no lockout).

**M6 — Rate limiting only on login** · _Fixed_
- Added a general API limiter (600 / 15 min per IP, exempting the high-frequency
  authenticated poll and sync so normal use is never throttled) plus a tighter
  60 / 15 min limiter on the password endpoints, alongside the existing login
  limiter.

**M7 — Limited security headers (no CSP)** · _Fixed_
- Added a Content-Security-Policy (same-origin scripts; inline styles allowed;
  `connect-src 'self' https:` so the optional billing-API submit works), plus
  Cross-Origin-Opener/Resource-Policy and Permissions-Policy. Verified the
  production build has no inline scripts that the policy would block.

### Low

- **L1 — No ESLint/Prettier config** · _Pending_ — no automated lint gate; add a
  flat ESLint config.
- **L2 — CI/CD absent** · _Fixed_ — added `.github/workflows/ci.yml` running
  `npm ci → npm test → npm run build` on every push/PR.
- **L3 — SSRF surface** · _Accepted_ — the admin-configured external billing API
  URL is protocol-validated (`http/https`) and admin-only.
- **L4 — Cosmetic** · residual unused `StatusBadge` map entry (`forwarded`);
  harmless, left in place.

## Warehouse domain notes

The app models the **operational + billing** side well (receiving/putaway/
picking/packing via activities; inbound/outbound offloading/loading with
CBM, handling type, vehicle, trucks, and package lines; per-day storage billing
with monthly minimums; handling charges; VAS; audit log; attendance; RBAC).

It is **not a full inventory WMS**: there is no stock/quantity ledger,
location/bin management, pallet/LPN tracking, formal ASN/GRN documents, cycle
count as an inventory adjustment, shipment tracking, or proof of delivery. These
are natural next-phase additions if inventory accuracy becomes in-scope.

## Changelog (this pass)

| File | Change | Why |
|------|--------|-----|
| `server/index.js` | Guard `users` writes on `/api/db/sync` to Admin/Developer | Closes privilege escalation (C1) |
| `server/merge.js` | **New** — pure record-level merge extracted from `db.js` | Testability + separation of concerns (M3) |
| `server/db.js` | Import merge from `merge.js` | Same |
| `tests/*.test.js` | **New** — 17 tests (billing, merge, utils) | Test coverage (H3) |
| `package.json` | Add `test` script | Runnable test suite / CI |
| `.github/workflows/ci.yml` | **New** — build + test CI | CI/CD gap (L2) |
| `src/store.jsx` | Remove dead exports/imports (`startActivity`, `addActivity`, `prefill`, `storageDaysDefault`, unused utils) | Dead-code cleanup (M4) |

## Final validation

- `npm run build` — succeeds.
- `npm test` — 17/17 pass.
- `node --check` — all server modules parse.
- No behavioural/regression changes to billing, sync, auth, or workflows.
