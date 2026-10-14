# Health Rider Delivery-only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove finance, payout, service-rate and monetary-data features so Health Rider manages home medication delivery only.

**Architecture:** Keep Next.js/React, Prisma and MariaDB while making Delivery Zone a location-only reference. Rebuild the disposable UAT database from a revised baseline migration so payment tables and monetary fields never exist, then remove the dependent server/UI/test/documentation surfaces.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma/MariaDB, Vitest, Playwright, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-02-health-rider-delivery-only-scope-change.md`

## Global Constraints

- HOSxP remains read-only; pharmacy confirmation is required before a Delivery Request exists.
- Keep only roles `pharmacy`, `coordinator`, `rider`, `admin` and `auditor`.
- Delivery Zone/หมู่บ้าน is a location and filtering reference only; do not retain or introduce monetary data.
- QR claim stays online and atomic; offline capture starts only after claim succeeds.
- Preserve patient-data minimisation, privacy-preserving evidence, immutable audit, same-day return/retry, and offline sync/conflict rules.
- UAT database is disposable: reset it before applying the revised migration; no production or real HOSxP changes.

## Review Focus

- A pharmacy confirmation for a valid zone creates a request without a monetary property; pin this in Task 1 domain/API tests.
- An unknown zone still rejects confirmation without creating a request; retain/add this in Task 1.
- A session or persisted user record with role `finance` is invalid after the schema/client change; pin role validation in Task 1.
- A fresh MariaDB schema contains neither payout/rate tables nor monetary request columns; inspect it in Task 4.
- Staff navigation and public route discovery expose no finance or rate endpoint/page; pin this in Task 2 Playwright/API coverage.

---

### Task 1: Remove monetary concepts from access, confirmation, and Prisma schema

**Files:**
- Modify: `platform/prisma/schema.prisma`
- Modify: `platform/prisma/migrations/20261001000000_delivery_core/migration.sql`
- Modify: `platform/src/auth/roles.ts`
- Modify: `platform/src/domain/delivery/confirm-candidate.ts`
- Modify: `platform/src/app/api/pharmacy/candidates/confirm/route.ts`
- Modify: `platform/tests/domain/confirm-candidate.test.ts`
- Modify: `platform/tests/api/pharmacy-confirm.test.ts`
- Modify: `platform/tests/integration/claim-package-qr-db.test.ts`
- Delete: `platform/tests/domain/zone-rate.test.ts`
- Delete: `platform/tests/api/zone-rate-admin.test.ts`

**Interfaces:**
- Consumes: `HosCandidate`, `SessionUser`, `DeliveryZone` matching by subdistrict/village.
- Produces: `ConfirmedDeliveryRequest` with `id`, HOSxP/patient delivery fields, `deliveryZoneId`, and `createdById`; it has no rate fields and `ConfirmationStore` has no `resolveRate` member.

- [ ] **Step 1: Write the failing confirmation tests**

Update the domain and API success tests to assert a valid zone creates a request with `deliveryZoneId` and no `rateSatangSnapshot`/`rateEffectiveOn`; retain a missing-zone rejection test. Add a role test proving `userRoles` excludes `finance`.

- [ ] **Step 2: Run focused tests to verify the revised contract fails**

Run: `npm run test -- tests/domain/confirm-candidate.test.ts tests/api/pharmacy-confirm.test.ts`

Expected: FAIL because confirmation still resolves and returns rate data.

- [ ] **Step 3: Implement the location-only confirmation contract**

Remove `finance` and `PayoutPeriodStatus`, `ZoneRate`, `PayoutPeriod`, `PayoutLine`, request rate fields, and their relations from `schema.prisma`. Change `DeliveryZone` to retain only `requests`. Remove `resolveRate` and rate properties from `ConfirmedDeliveryRequest`, `ConfirmationStore`, `confirmCandidate`, and its route adapter. Update the initial migration SQL to create the same clean schema for an empty UAT database: no rate/payout tables, no monetary request columns, and no `finance` enum value.

- [ ] **Step 4: Update database-dependent fixture and remove rate-only tests**

Change the QR concurrency fixture to create a Delivery Request with location/patient fields only. Delete tests exclusively asserting zone-rate behaviour and remove their imports/references.

- [ ] **Step 5: Regenerate Prisma client and run focused verification**

Run: `npx prisma generate && npm run test -- tests/domain/confirm-candidate.test.ts tests/api/pharmacy-confirm.test.ts tests/integration/claim-package-qr-db.test.ts`

Expected: PASS; the database integration test may be skipped only when `DATABASE_URL` is unset.

- [ ] **Step 6: Commit the schema and confirmation change**

```bash
git add platform/prisma platform/src/auth/roles.ts platform/src/domain/delivery/confirm-candidate.ts platform/src/app/api/pharmacy/candidates/confirm/route.ts platform/tests
git commit -m "refactor: remove delivery payment data"
```

### Task 2: Remove payout/rate modules and staff surfaces

**Files:**
- Delete: `platform/src/domain/rates/create-zone-rate.ts`
- Delete: `platform/src/domain/rates/resolve-zone-rate.ts`
- Delete: `platform/src/domain/payout/approve-period.ts`
- Delete: `platform/src/domain/payout/close-period.ts`
- Delete: `platform/src/domain/payout/create-period.ts`
- Delete: `platform/src/domain/payout/export-csv.ts`
- Delete: `platform/src/app/api/admin/zone-rates/route.ts`
- Delete: `platform/src/app/api/finance/payout-periods/route.ts`
- Delete: `platform/src/app/api/finance/payout-periods/[periodId]/export/route.ts`
- Delete: `platform/src/app/(staff)/finance/payouts/page.tsx`
- Modify: `platform/src/app/(staff)/pharmacy/candidates/page.tsx`
- Modify: `platform/src/app/(staff)/pharmacy/candidates/pharmacy-candidate-list.tsx`
- Modify: `platform/e2e/role-workflow.spec.ts`
- Delete: `platform/tests/domain/payout-period.test.ts`
- Delete: `platform/tests/api/payout-export.test.ts`

**Interfaces:**
- Consumes: Task 1 location-only `DeliveryRequest` and user roles.
- Produces: staff workflows that contain pharmacy, operations and read-only audit surfaces only; there is no finance/rate source module, route or UI copy.

- [ ] **Step 1: Write the failing staff workflow test**

Replace the payout expectation with a test that visits pharmacy, operations and audit pages successfully and asserts no page text/link targets `finance`, `payout`, `อัตราค่าบริการ`, or a currency amount.

- [ ] **Step 2: Run the staff workflow test to verify it fails**

Run: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 npm run test:e2e -- role-workflow`

Expected: FAIL until the test server/UI no longer contains the payout surface.

- [ ] **Step 3: Delete payment/rate surfaces and revise pharmacy copy**

Delete the listed domain modules, API routes, staff page and their focused tests. Change pharmacy text/errors to refer only to the required delivery zone; do not replace deleted amount fields with placeholders.

- [ ] **Step 4: Run static and browser verification**

Run: `rg -n -i "payout|finance|zone rate|rateSatang|rateEffective|อัตราค่าบริการ|ค่าตอบแทน" platform/src platform/tests platform/e2e --glob '!platform/node_modules/**'; if ($LASTEXITCODE -ne 1) { exit $LASTEXITCODE }; $env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3101'; npm run test:e2e -- role-workflow`

Expected: `rg` returns no matches in the scoped implementation/tests and Playwright passes after rebuilding/restarting the local test server.

- [ ] **Step 5: Commit the surface removal**

```bash
git add -A platform/src platform/tests platform/e2e
git commit -m "refactor: remove finance and rate surfaces"
```

### Task 3: Rewrite UAT and operations artefacts for delivery-only roles

**Files:**
- Modify: `docs/uat/2026-10-01-health-rider-uat-checklist.md`
- Modify: `docs/uat/pharmacy-uat.md`
- Modify: `docs/uat/rider-uat.md`
- Modify: `docs/uat/coordinator-uat.md`
- Delete: `docs/uat/finance-uat.md`
- Modify: `docs/operations/test-data-and-accounts.md`
- Modify: `docs/operations/user-training-and-incident-playbook.md`
- Modify: `docs/operations/staging-production-guide.md`
- Modify: `docs/release/release-and-rollback-checklist.md`
- Modify: `README.md` if it mentions payment, rate, or finance

**Interfaces:**
- Consumes: Task 1 role/schema contract and Task 2 page/API scope.
- Produces: Thai-first staging/UAT material for pharmacy, rider, coordinator, admin/auditor only, with no financial-test, user-account or release condition.

- [ ] **Step 1: Write a documentation scope check**

Add/adjust a repository text check that flags `finance`, `payout`, `rate`, `ค่าตอบแทน`, `อัตราค่าบริการ`, and currency references under active UAT/operations/release documents, excluding the superseded historical specs that explicitly describe their replacement.

- [ ] **Step 2: Run the scope check to verify it fails**

Run: `rg -n -i "finance|payout|rate|ค่าตอบแทน|อัตราค่าบริการ|satang" docs/uat docs/operations docs/release README.md`

Expected: FAIL by finding the current financial documents/copy.

- [ ] **Step 3: Rewrite active operating material**

Remove the finance UAT file and financial account. Replace rate-snapshot checks with delivery-zone selection/visibility checks. Remove payment wording from rider failure, pharmacy confirmation, training, staging and release documents. Preserve the testing of HOSxP read-only, QR privacy, offline sync, return/retry, coordinator amendment and audit read-only access.

- [ ] **Step 4: Run the scope check and Markdown review**

Run: `rg -n -i "finance|payout|rate|ค่าตอบแทน|อัตราค่าบริการ|satang" docs/uat docs/operations docs/release README.md; if ($LASTEXITCODE -ne 1) { exit $LASTEXITCODE }; git diff --check`

Expected: no active-document matches and no whitespace errors. Any match in explicitly superseded specifications is acceptable only outside the command scope.

- [ ] **Step 5: Commit the delivery-only operational material**

```bash
git add docs/uat docs/operations docs/release README.md
git commit -m "docs: align UAT with delivery-only scope"
```

### Task 4: Rebuild the disposable UAT database and perform full verification

**Files:**
- Modify: `docs/operations/staging-production-guide.md` only if Task 3 needs to add exact reset prerequisites.
- Test: `platform/tests/integration/claim-package-qr-db.test.ts`

**Interfaces:**
- Consumes: revised Prisma baseline migration and all delivery-only application contracts.
- Produces: evidence that a fresh UAT database has the intended schema and that the existing delivery workflow still builds and tests.

- [ ] **Step 1: Record the reset boundary before any destructive command**

Verify the selected `DATABASE_URL` is the disposable UAT/local Compose database, not HOSxP or production. Capture a backup/export according to hospital policy before reset; do not print credentials.

- [ ] **Step 2: Reset the confirmed disposable database and apply migrations**

Run the repository-approved Compose/database reset procedure only after confirming its exact target, then run `npx prisma migrate deploy` and `npx prisma generate` from `platform/`.

Expected: a clean migration history and generated Prisma client.

- [ ] **Step 3: Inspect target schema with a failing-absence check**

Run a MariaDB information-schema query against the confirmed disposable database asserting these names are absent: `zone_rates`, `payout_periods`, `payout_lines`, `rateSatangSnapshot`, `rateEffectiveOn`. Assert the `users.role` enum has no `finance` value.

Expected: all assertions pass; if any legacy object exists, stop and correct the migration/reset target before UAT.

- [ ] **Step 4: Run all automated verification**

Run: `npm run test && npm run build && docker compose -f compose.yaml config`

Run: `DATABASE_URL=<confirmed disposable UAT URL> npm run test -- tests/integration/claim-package-qr-db.test.ts`

Run: start the built app on an isolated port, then `PLAYWRIGHT_BASE_URL=http://127.0.0.1:<port> npm run test:e2e`

Expected: unit tests, build, Compose configuration, MariaDB QR concurrency test and browser workflows pass. Do not treat HOSxP/live staging UAT as complete from these local checks.

- [ ] **Step 5: Commit any verification-document adjustment and report UAT boundary**

```bash
git add docs/operations/staging-production-guide.md
git commit -m "docs: document delivery-only database reset"
```

Only commit if the guide changed; otherwise leave this task without an empty commit. Report that real HOSxP/staging UAT still requires hospital execution and sign-off.

## Plan Self-Review

- Spec coverage: Tasks 1–2 remove all schema, roles, API, UI and tests; Task 3 removes operational/UAT references; Task 4 proves a fresh disposable database and retained delivery workflow.
- Type consistency: Task 1 defines the no-rate `ConfirmedDeliveryRequest` contract that Task 2 and later surfaces consume.
- Review focus: every listed risk is assigned to Tasks 1, 2 or 4.
- Proportion: implementation is four independently testable tasks; no code is duplicated into the plan.
