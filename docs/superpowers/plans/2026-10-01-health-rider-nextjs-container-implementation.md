# Health Rider Next.js Container Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a containerized Next.js/React and MariaDB Health Rider application that supports the approved, auditable medication-delivery workflow.

**Architecture:** A clean `platform/` Next.js App Router project is created in a new worktree. Route handlers call focused TypeScript service modules, Prisma owns the Health Rider MariaDB schema, and an isolated HOS adapter is read-only. Rider offline behavior lives in browser-only PWA modules and synchronizes idempotent events through the application API.

**Tech Stack:** Node.js 22 LTS, Next.js App Router, React, TypeScript, Prisma, MariaDB 11, Docker Compose, Vitest, Playwright, IndexedDB, Workbox service worker.

**Spec:** `docs/superpowers/specs/2026-10-01-health-rider-nextjs-container-design.md`

## Global Constraints

- All user-facing copy is Thai-first; values in logs and tests contain no real patient data or credentials.
- HOS is an external read-only dependency configured only by `HOS_DATABASE_URL`; automated tests never connect to HOS.
- Health Rider owns its MariaDB schema, uses ULID public identifiers, and stores money as integer satang.
- QR values are opaque random expiring identifiers and never embed patient or medication information.
- QR claim is online and atomic; offline recording begins only after a successful claim.
- Rider access is restricted to data for attempts they claimed: full name, HN, age, telephone and address only.
- Every business mutation is audited; closed payout periods and audit records are immutable.
- Do not open production services, create HOS accounts, use real patient records, or perform a data migration.

## Review Focus

- Two valid riders claim one QR concurrently: exactly one receives success and the other receives a conflict without patient data.
- A zone rate changes after request creation: existing snapshot rate and a closed payout line do not change.
- A queued offline event is retried after a timeout: server records it once and client retains evidence until acknowledgement.
- A coordinator changes an in-transit address: old evidence is retained and an event using the old version is routed to review.
- An authenticated rider requests an unclaimed or another rider's attempt: it receives no patient fields and a 403/404 response.

---

### Task 1: Create the containerized Next.js foundation

**Files:**
- Create: `platform/package.json`, `platform/next.config.ts`, `platform/tsconfig.json`, `platform/vitest.config.ts`, `platform/playwright.config.ts`
- Create: `platform/Dockerfile`, `platform/compose.yaml`, `platform/.env.example`, `platform/src/app/layout.tsx`, `platform/src/app/page.tsx`
- Create: `platform/tests/smoke/home.test.tsx`, `platform/tests/compose/compose-config.test.ts`

**Interfaces:**
- Produces `npm run dev`, `npm run build`, `npm run test`, `npm run test:e2e`, and `docker compose config` entry points.
- Produces a typed `env` module used by all later server modules.

- [ ] **Step 1: Write failing smoke and compose assertions.**

Assert Thai page title/landing copy renders and Compose declares only `web` and `db`, uses a MariaDB healthcheck, and has no HOS container.

- [ ] **Step 2: Run the focused tests to verify they fail.**

Run: `npm run test -- tests/smoke/home.test.tsx tests/compose/compose-config.test.ts`  
Expected: FAIL because the platform project and Compose configuration do not exist.

- [ ] **Step 3: Scaffold the TypeScript Next.js application and Docker Compose configuration.**

Use a multi-stage Node 22 image, a named MariaDB volume, non-secret `.env.example`, and runtime validation requiring `DATABASE_URL`; the HOS adapter must refuse reads with a clear configuration error when its separate `HOS_DATABASE_URL` is absent.

- [ ] **Step 4: Run build and configuration verification.**

Run: `npm run test -- tests/smoke/home.test.tsx tests/compose/compose-config.test.ts && npm run build && docker compose -f compose.yaml config`  
Expected: PASS.

- [ ] **Step 5: Commit the foundation.**

```bash
git add platform
git commit -m "build: scaffold containerized Next.js platform"
```

### Task 2: Model the delivery domain and audit schema

**Files:**
- Create: `platform/prisma/schema.prisma`, `platform/prisma/seed.ts`
- Create: `platform/src/lib/db.ts`, `platform/src/domain/delivery/status.ts`, `platform/src/domain/audit/write-audit-event.ts`
- Create: `platform/tests/domain/delivery-schema.test.ts`, `platform/tests/domain/audit-event.test.ts`

**Interfaces:**
- Produces Prisma models for users, rider profiles, zones, rates, requests, attempts, evidence, offline events, conflicts, payout periods/lines, and audit events.
- Produces `writeAuditEvent(input: AuditInput): Promise<AuditEvent>` for every mutation task.

- [ ] **Step 1: Write failing schema and audit tests.**

Assert `DeliveryAttemptStatus` allows only approved state values, public IDs are ULIDs, and an audit event preserves actor, action, reason, old value and new value.

- [ ] **Step 2: Run focused tests to verify they fail.**

Run: `npm run test -- tests/domain/delivery-schema.test.ts tests/domain/audit-event.test.ts`  
Expected: FAIL because the Prisma schema and audit writer are absent.

- [ ] **Step 3: Implement Prisma schema, migration, typed Prisma client, delivery states, and immutable audit writer.**

Use satang integer fields for rates and unique event UUID plus rider constraints for future sync idempotency.

- [ ] **Step 4: Run migration and focused tests.**

Run: `npx prisma migrate deploy && npm run test -- tests/domain/delivery-schema.test.ts tests/domain/audit-event.test.ts`  
Expected: PASS against the test MariaDB container.

- [ ] **Step 5: Commit the domain schema.**

```bash
git add platform
git commit -m "feat: model auditable delivery domain"
```

### Task 3: Implement identity, roles, and private rider data access

**Files:**
- Create: `platform/src/auth/session.ts`, `platform/src/auth/roles.ts`, `platform/src/auth/require-role.ts`
- Create: `platform/src/app/api/rider/attempts/[attemptId]/route.ts`
- Create: `platform/tests/auth/role-access.test.ts`, `platform/tests/api/rider-attempt-access.test.ts`

**Interfaces:**
- `requireRole(session, ...roles): SessionUser` rejects unauthenticated and unauthorized users.
- `canViewRiderAttempt(userId: string, attemptId: string): Promise<boolean>` returns true only for the claiming rider, coordinator, or admin as allowed by role.

- [ ] **Step 1: Write failing access tests.**

Assert another rider receives no patient data, claimant receives only allowed snapshot fields, and coordinator/admin role checks are explicit.

- [ ] **Step 2: Run the focused tests to verify they fail.**

Run: `npm run test -- tests/auth/role-access.test.ts tests/api/rider-attempt-access.test.ts`  
Expected: FAIL because session/role boundary and route are absent.

- [ ] **Step 3: Implement hashed local credentials, session boundary, roles, and the constrained rider attempt response.**

Keep medication, CID and clinical history out of the response type entirely.

- [ ] **Step 4: Run focused tests.**

Run: `npm run test -- tests/auth/role-access.test.ts tests/api/rider-attempt-access.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit role-restricted access.**

```bash
git add platform
git commit -m "feat: restrict delivery access by role and claim"
```

### Task 4: Maintain effective-dated zones and rate snapshots

**Files:**
- Create: `platform/src/domain/rates/resolve-zone-rate.ts`, `platform/src/domain/rates/create-zone-rate.ts`
- Create: `platform/src/app/api/admin/zone-rates/route.ts`
- Create: `platform/tests/domain/zone-rate.test.ts`, `platform/tests/api/zone-rate-admin.test.ts`

**Interfaces:**
- `resolveZoneRate(zoneId: string, on: Date): Promise<ZoneRate>` selects one effective rate.
- `createZoneRate(input, actor): Promise<ZoneRate>` rejects an overlapping effective range and writes an audit event.

- [ ] **Step 1: Write failing effective-date and authorization tests.**

Assert a 1 October date selects 2,500 satang, overlap is rejected, and a rider cannot create rates.

- [ ] **Step 2: Run focused tests to verify they fail.**

Run: `npm run test -- tests/domain/zone-rate.test.ts tests/api/zone-rate-admin.test.ts`  
Expected: FAIL because rate services and route are absent.

- [ ] **Step 3: Implement zone/rate services, unique constraints, admin route, and rate snapshot helper.**

The helper returns an integer satang value copied onto each confirmed delivery request; no later rate edit can update it.

- [ ] **Step 4: Run focused tests including snapshot immutability.**

Run: `npm run test -- tests/domain/zone-rate.test.ts tests/api/zone-rate-admin.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit zone-rate behavior.**

```bash
git add platform
git commit -m "feat: snapshot effective delivery zone rates"
```

### Task 5: Read HOS candidates and confirm pharmacy requests

**Files:**
- Create: `platform/src/hos/candidate-repository.ts`, `platform/src/hos/mysql-candidate-repository.ts`, `platform/src/hos/types.ts`
- Create: `platform/src/domain/delivery/confirm-candidate.ts`
- Create: `platform/src/app/api/pharmacy/candidates/route.ts`, `platform/src/app/api/pharmacy/candidates/confirm/route.ts`
- Create: `platform/src/app/(staff)/pharmacy/candidates/page.tsx`
- Create: `platform/tests/hos/mysql-candidate-repository.test.ts`, `platform/tests/domain/confirm-candidate.test.ts`, `platform/tests/api/pharmacy-confirm.test.ts`

**Interfaces:**
- `HosCandidateRepository.eligibleFor(range): Promise<HosCandidate[]>` returns DTOs, never Prisma/HOS models.
- `confirmCandidate(candidate, pharmacist): Promise<DeliveryRequest>` validates pharmacy role, rate and delivery snapshot.

- [ ] **Step 1: Write failing adapter and confirmation tests.**

Use a fake HOS connection fixture to prove encoding conversion and candidate mapping; assert merely reading a candidate creates no request.

- [ ] **Step 2: Run focused tests to verify they fail.**

Run: `npm run test -- tests/hos/mysql-candidate-repository.test.ts tests/domain/confirm-candidate.test.ts tests/api/pharmacy-confirm.test.ts`  
Expected: FAIL because adapter, confirmation service and routes are absent.

- [ ] **Step 3: Implement read-only HOS adapter, configurable eligibility rules, confirmation service, API and Thai pharmacy page.**

Enforce that only pharmacy/admin can confirm; never place HOS credentials or medication details in client bundles.

- [ ] **Step 4: Run focused tests and the pharmacy page test.**

Run: `npm run test -- tests/hos/mysql-candidate-repository.test.ts tests/domain/confirm-candidate.test.ts tests/api/pharmacy-confirm.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit HOS intake.**

```bash
git add platform
git commit -m "feat: confirm pharmacy delivery requests from HOS"
```

### Task 6: Prepare packages and claim opaque QR codes atomically

**Files:**
- Create: `platform/src/domain/delivery/prepare-attempt.ts`, `platform/src/domain/delivery/issue-package-qr.ts`, `platform/src/domain/delivery/claim-package-qr.ts`
- Create: `platform/src/app/api/pharmacy/attempts/prepare/route.ts`, `platform/src/app/api/rider/claims/route.ts`
- Create: `platform/src/app/(staff)/pharmacy/packages/page.tsx`, `platform/src/app/(rider)/rider/scan/page.tsx`
- Create: `platform/tests/domain/package-qr.test.ts`, `platform/tests/domain/claim-package-qr.test.ts`, `platform/tests/api/rider-claim.test.ts`

**Interfaces:**
- `issuePackageQr(attemptId, expiresAt): Promise<string>` returns an opaque one-time token and stores only its hash.
- `claimPackageQr(token, riderId, claimedAt): Promise<ClaimResult>` performs a transaction and returns one claimed attempt or a typed conflict/invalid result.

- [ ] **Step 1: Write failing QR and concurrency tests.**

Assert a token contains no HN/name, expired token is invalid, and two transactions produce exactly one claim success.

- [ ] **Step 2: Run focused tests to verify they fail.**

Run: `npm run test -- tests/domain/package-qr.test.ts tests/domain/claim-package-qr.test.ts tests/api/rider-claim.test.ts`  
Expected: FAIL because QR and claim services are absent.

- [ ] **Step 3: Implement package preparation, QR print payload, atomic claim transaction, audit events, and Thai scan page.**

Return 409 for already-claimed QR, 422 for invalid/expired QR, and never return patient details in a failure body.

- [ ] **Step 4: Run focused tests against MariaDB.**

Run: `npm run test -- tests/domain/package-qr.test.ts tests/domain/claim-package-qr.test.ts tests/api/rider-claim.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit package preparation and claim.**

```bash
git add platform
git commit -m "feat: issue and claim opaque package QR codes"
```

### Task 7: Add Rider PWA offline evidence queue and synchronization

**Files:**
- Create: `platform/src/pwa/service-worker.ts`, `platform/src/pwa/offline-queue.ts`, `platform/src/pwa/indexeddb-store.ts`, `platform/src/pwa/crypto.ts`
- Create: `platform/src/app/api/rider/sync-events/route.ts`, `platform/src/domain/delivery/sync-offline-event.ts`
- Create: `platform/src/app/(rider)/rider/attempts/[attemptId]/page.tsx`
- Create: `platform/tests/pwa/offline-queue.test.ts`, `platform/tests/domain/sync-offline-event.test.ts`, `platform/e2e/rider-offline-sync.spec.ts`

**Interfaces:**
- `OfflineQueue.enqueue(event): Promise<void>` stores UUID, device time, delivery version, evidence blob and encrypted payload.
- `OfflineQueue.sync(client): Promise<SyncSummary>` removes an entry only after explicit server acknowledgement.
- `syncOfflineEvent(event, rider): Promise<SyncResult>` is idempotent by `(eventUuid, riderId)`.

- [ ] **Step 1: Write failing queue, idempotency, and mobile browser tests.**

Assert a failed request leaves data queued, duplicate UUID makes one server event, and an acknowledged sync removes evidence locally.

- [ ] **Step 2: Run focused tests to verify they fail.**

Run: `npm run test -- tests/pwa/offline-queue.test.ts tests/domain/sync-offline-event.test.ts && npm run test:e2e -- rider-offline-sync`  
Expected: FAIL because queue, sync API and PWA route are absent.

- [ ] **Step 3: Implement PWA registration, encrypted IndexedDB queue, evidence capture, idempotent route handler, and Rider attempt page.**

Do not cache patient-bearing API responses. Require claim ownership and record both device-captured and server-received timestamps.

- [ ] **Step 4: Run focused PWA, domain, and Playwright tests.**

Run: `npm run test -- tests/pwa/offline-queue.test.ts tests/domain/sync-offline-event.test.ts && npm run test:e2e -- rider-offline-sync`  
Expected: PASS.

- [ ] **Step 5: Commit offline delivery support.**

```bash
git add platform
git commit -m "feat: sync rider evidence after offline delivery work"
```

### Task 8: Handle exceptions, returns, amendments, and conflicts

**Files:**
- Create: `platform/src/domain/delivery/record-failed-delivery.ts`, `platform/src/domain/delivery/receive-medication-return.ts`, `platform/src/domain/delivery/amend-in-transit.ts`, `platform/src/domain/delivery/resolve-sync-conflict.ts`
- Create: `platform/src/app/api/operations/exceptions/route.ts`, `platform/src/app/(staff)/operations/exceptions/page.tsx`
- Create: `platform/tests/domain/failed-return.test.ts`, `platform/tests/domain/in-transit-amendment.test.ts`, `platform/tests/domain/sync-conflict.test.ts`

**Interfaces:**
- `recordFailedDelivery(attemptId, data, rider): Promise<DeliveryAttempt>` moves the attempt to `return_required`.
- `receiveMedicationReturn(attemptId, pharmacist): Promise<DeliveryAttempt>` confirms same-day return and permits a new attempt.
- `amendInTransit(requestId, data, coordinator): Promise<AuditEvent>` increments the delivery version and preserves old/new values.

- [ ] **Step 1: Write failing return, retry, amendment and conflict tests.**

Assert failure requires standard reason, retry needs a confirmed return plus a new QR, and old-version evidence is retained for review.

- [ ] **Step 2: Run focused tests to verify they fail.**

Run: `npm run test -- tests/domain/failed-return.test.ts tests/domain/in-transit-amendment.test.ts tests/domain/sync-conflict.test.ts`  
Expected: FAIL because exception services are absent.

- [ ] **Step 3: Implement exception services, coordinator queue API/page, state guards and audit records.**

HN and package identity are never amendment fields; conflict resolution records a decision without deleting supplied evidence.

- [ ] **Step 4: Run focused tests.**

Run: `npm run test -- tests/domain/failed-return.test.ts tests/domain/in-transit-amendment.test.ts tests/domain/sync-conflict.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit exception handling.**

```bash
git add platform
git commit -m "feat: manage delivery exceptions and sync conflicts"
```

### Task 9: Complete operations, payout, reporting, and release verification

**Files:**
- Create: `platform/src/domain/payout/create-period.ts`, `platform/src/domain/payout/approve-period.ts`, `platform/src/domain/payout/close-period.ts`, `platform/src/domain/payout/export-csv.ts`
- Create: `platform/src/app/api/operations/dashboard/route.ts`, `platform/src/app/api/finance/payout-periods/route.ts`, `platform/src/app/api/finance/payout-periods/[periodId]/export/route.ts`
- Create: `platform/src/app/(staff)/operations/page.tsx`, `platform/src/app/(staff)/finance/payouts/page.tsx`, `platform/src/app/(staff)/audit/page.tsx`
- Create: `platform/tests/domain/payout-period.test.ts`, `platform/tests/api/dashboard.test.ts`, `platform/tests/api/audit-read-only.test.ts`, `platform/tests/api/payout-export.test.ts`, `platform/e2e/role-workflow.spec.ts`

**Interfaces:**
- `createPayoutPeriod(month, financeUser): Promise<PayoutPeriod>` includes only delivered attempts with complete proof and snapshots.
- `approvePayoutPeriod(periodId, financeUser): Promise<PayoutPeriod>` and `closePayoutPeriod(periodId, financeUser): Promise<PayoutPeriod>` enforce finance-only immutable state changes.
- `exportPayoutCsv(periodId): ReadableStream` exposes rider code/name, attempt reference, zone, rate and totals only.

- [ ] **Step 1: Write failing operations, audit, payout, CSV and end-to-end workflow tests.**

Assert dashboard filters date/zone/rider/status; audit accepts no mutation route; failed/incomplete delivery is excluded; closing a period blocks changes; CSV contains only approved columns.

- [ ] **Step 2: Run focused tests to verify they fail.**

Run: `npm run test -- tests/domain/payout-period.test.ts tests/api/dashboard.test.ts tests/api/audit-read-only.test.ts tests/api/payout-export.test.ts && npm run test:e2e -- role-workflow`  
Expected: FAIL because these modules and pages are absent.

- [ ] **Step 3: Implement daily operations views, read-only audit access, finance actions, CSV export, and Thai staff pages.**

Do not add payment execution, bank records, or any mutation to closed periods.

- [ ] **Step 4: Run complete application verification.**

Run: `npm run test && npm run test:e2e && npm run build && docker compose -f compose.yaml config`  
Expected: PASS.

- [ ] **Step 5: Commit final release-ready application scope.**

```bash
git add platform
git commit -m "feat: complete operations and monthly rider payouts"
```

## Coverage Review

Tasks 1–2 create the container and trustworthy data/audit substrate. Tasks 3–6 provide authorization, HOS intake, rate snapshot, pharmacy packaging and atomic rider claim. Tasks 7–8 implement the high-risk offline/exception branches. Task 9 completes daily operations, financial reporting and end-to-end verification. No task writes to HOS or adds excluded notification, routing, GPS, OTP, consent, payment execution, or production deployment capabilities.
