# Health Rider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Health Rider release: HOSxP read-only intake, pharmacy QR preparation, secure rider delivery with offline evidence, operations review, and monthly rider payout reporting.

**Architecture:** Create a Laravel 12 application in `platform/` with a MySQL 8 Health Rider database and a separate read-only HOSxP connection. Inertia/Vue provides the role-based web UI; the rider view is an installable PWA with IndexedDB event queue. The Laravel API is the sole authority for status transitions, QR claims, authorisation, audit events, and payout calculation.

**Tech Stack:** PHP 8.3, Laravel 12, MySQL 8, Laravel Sanctum/session authentication, Inertia.js, Vue 3, Vite PWA, IndexedDB, Pest, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-health-rider-design.md`

## Global Constraints

- HOSxP is read-only; the application must never write to HOSxP.
- QR contains only an opaque expiring random package identifier, never patient or medication data.
- QR claim requires an online atomic server confirmation; offline capture begins only after claim.
- Rider data access is limited to the rider's claimed attempts and includes name, HN, age, telephone number, and delivery address only.
- Delivery success requires time, privacy-preserving photo, and recipient relationship.
- Zone rates are effective-dated and snapshotted into the Delivery Request; closed payout periods are immutable.
- Failed delivery requires same-day pharmacy return; a retry is a new Delivery Attempt with a new QR.
- Offline events preserve device-captured and server-received times, are idempotent, and are removed from the device after confirmed sync.
- No consent workflow, patient notification, GPS, OTP, automatic dispatch, route optimisation, bank data, or real payment integration belongs in this release.
- UI copy and operational documentation are Thai; audit events are never deleted.

## Review Focus

- Two riders scan the same QR concurrently: exactly one claim succeeds and no patient data leaks in the losing response. Covered by Task 6.
- A rate changes after a request is created: the payout uses the request snapshot, not the current rate. Covered by Task 3 and Task 10.
- An offline delivery sync is retried after an ambiguous network failure: one evidence event and one status transition exist. Covered by Task 7.
- A coordinator changes an address while a rider is offline: the older evidence is retained and enters review rather than being discarded. Covered by Task 8.
- An unauthorised rider opens a known attempt URL or API endpoint: access is denied without returning patient details. Covered by Task 4 and Task 6.

---

## File Structure

```text
platform/
  app/
    Actions/                         # small state-transition and audit actions
    Domain/Delivery/                 # requests, attempts, evidence, QR and sync logic
    Domain/Payout/                   # payout period and line calculation
    Domain/Hos/                      # read-only HOSxP candidate adapter
    Http/Controllers/
    Http/Requests/
    Models/
    Policies/
  database/migrations/
  resources/js/
    pages/pharmacy/ pages/operations/ pages/finance/ pages/rider/
    offline/                         # IndexedDB queue and service worker integration
  routes/web.php routes/api.php
  tests/Feature/ tests/Unit/
  resources/views/
```

`docs/` and `CONTEXT.md` remain at repository root. No credentials, production HOSxP addresses, or patient fixtures belong in the repository.

### Task 1: Bootstrap the application and delivery domain baseline

**Files:**
- Create: `platform/` Laravel 12 skeleton, `platform/.env.example`, `platform/config/database.php`
- Create: `platform/app/Domain/Delivery/Enums/DeliveryAttemptStatus.php`
- Create: `platform/app/Models/DeliveryRequest.php`, `platform/app/Models/DeliveryAttempt.php`, `platform/app/Models/AuditEvent.php`
- Create: `platform/database/migrations/*_create_delivery_core_tables.php`
- Test: `platform/tests/Feature/Database/DeliveryCoreSchemaTest.php`

**Interfaces:**
- Produces `DeliveryAttemptStatus` values: `prepared`, `claimed`, `in_transit`, `delivered`, `delivery_failed`, `return_required`, `returned`, `sync_review`.
- Produces `DeliveryRequest` and `DeliveryAttempt` Eloquent models for later actions.

- [ ] **Step 1: Create `platform/` with the Laravel 12 skeleton and configure `health_rider` as the default MySQL connection plus `hos` as a read-only MySQL connection sourced only from environment variables.**

- [ ] **Step 2: Write failing schema tests in `tests/Feature/Database/DeliveryCoreSchemaTest.php`.**

```php
it('persists one request with multiple attempts and immutable audit events', function () {
    $request = DeliveryRequest::factory()->create();
    $attempt = DeliveryAttempt::factory()->for($request)->create();
    AuditEvent::factory()->for($attempt, 'auditable')->create();

    expect($request->attempts)->toHaveCount(1);
});
```

- [ ] **Step 3: Run the focused test to verify it fails.**

Run: `php artisan test tests/Feature/Database/DeliveryCoreSchemaTest.php`  
Expected: FAIL because the delivery models and tables do not exist.

- [ ] **Step 4: Implement the core migrations and models.**

Use ULID primary keys; include timestamps and foreign keys. `audit_events` stores actor ID, action, auditable morph reference, JSON old/new values, reason, device time, and server time. Do not add patient medical details to audit metadata.

- [ ] **Step 5: Run the focused test and the baseline suite.**

Run: `php artisan test tests/Feature/Database/DeliveryCoreSchemaTest.php`  
Expected: PASS.

- [ ] **Step 6: Commit the bootstrap and domain baseline.**

```bash
git add platform
git commit -m "feat: establish Health Rider delivery domain"
```

### Task 2: Add identities, roles, riders, policies, and access boundaries

**Files:**
- Modify: `platform/app/Models/User.php`, `platform/routes/web.php`
- Create: `platform/app/Enums/UserRole.php`, `platform/app/Models/RiderProfile.php`
- Create: `platform/app/Policies/DeliveryAttemptPolicy.php`
- Create: `platform/database/migrations/*_create_rider_profiles_table.php`
- Test: `platform/tests/Feature/Authorization/RiderAttemptAccessTest.php`

**Interfaces:**
- Produces `UserRole` values: `pharmacy`, `coordinator`, `rider`, `finance`, `admin`, `auditor`.
- Produces `DeliveryAttemptPolicy::view(User $user, DeliveryAttempt $attempt): bool`.

- [ ] **Step 1: Write failing authorisation tests for a claimed rider, a different rider, and a coordinator.**

```php
it('allows only the claiming rider to read rider delivery data', function () {
    $attempt = DeliveryAttempt::factory()->claimedBy($rider)->create();

    $this->actingAs($otherRider)->getJson("/api/rider/attempts/{$attempt->id}")
        ->assertForbidden();
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `php artisan test tests/Feature/Authorization/RiderAttemptAccessTest.php`  
Expected: FAIL because roles and policy are absent.

- [ ] **Step 3: Implement role storage, RiderProfile, policy registration, and role middleware.**

Rider profiles store rider code, display name, internal/external category, and active flag only. The rider response serializer exposes exactly the permitted delivery fields and no medicine, CID, or broader history.

- [ ] **Step 4: Run authorisation tests.**

Run: `php artisan test tests/Feature/Authorization/RiderAttemptAccessTest.php`  
Expected: PASS.

- [ ] **Step 5: Commit identity and access boundaries.**

```bash
git add platform
git commit -m "feat: enforce Health Rider role access"
```

### Task 3: Implement effective-dated zones and rate snapshots

**Files:**
- Create: `platform/app/Domain/Delivery/ZoneRateResolver.php`
- Create: `platform/app/Models/DeliveryZone.php`, `platform/app/Models/ZoneRate.php`
- Create: `platform/database/migrations/*_create_delivery_zones_and_zone_rates.php`
- Modify: `platform/app/Models/DeliveryRequest.php`
- Test: `platform/tests/Unit/Domain/Delivery/ZoneRateResolverTest.php`, `platform/tests/Feature/Delivery/RateSnapshotTest.php`

**Interfaces:**
- Produces `ZoneRateResolver::resolve(string $subdistrictCode, string $villageCode, CarbonInterface $on): ZoneRate`.
- Produces `DeliveryRequest::rateSnapshot(): int` in satang and `rate_effective_on`.

- [ ] **Step 1: Write failing resolver tests for the current zone, a later rate, and a missing rate.**

```php
it('selects the latest rate effective on the request date', function () {
    expect($resolver->resolve('04', '04', Carbon::parse('2026-10-01'))->satang)
        ->toBe(2500);
});
```

- [ ] **Step 2: Run the focused unit test to verify it fails.**

Run: `php artisan test tests/Unit/Domain/Delivery/ZoneRateResolverTest.php`  
Expected: FAIL because resolver and rate tables are absent.

- [ ] **Step 3: Implement zone/rate migrations, resolver, administrator-only maintenance endpoints, and request snapshot fields.**

Prevent overlapping effective date ranges per zone. Store money in integer satang; display Thai baht only in the UI.

- [ ] **Step 4: Write and run `RateSnapshotTest` proving that later zone-rate changes do not alter an existing request.**

Run: `php artisan test tests/Feature/Delivery/RateSnapshotTest.php`  
Expected: PASS.

- [ ] **Step 5: Commit zone-rate behaviour.**

```bash
git add platform
git commit -m "feat: snapshot effective delivery zone rates"
```

### Task 4: Build the read-only HOSxP candidate adapter and pharmacy confirmation

**Files:**
- Create: `platform/app/Domain/Hos/HosCandidateRepository.php`, `platform/app/Domain/Hos/MysqlHosCandidateRepository.php`
- Create: `platform/app/Domain/Delivery/CreateDeliveryRequest.php`
- Create: `platform/app/Http/Controllers/PharmacyCandidateController.php`, `platform/app/Http/Requests/ConfirmCandidateRequest.php`
- Create: `platform/resources/js/pages/pharmacy/CandidatesPage.vue`
- Test: `platform/tests/Feature/Pharmacy/ConfirmHosCandidateTest.php`, `platform/tests/Unit/Domain/Hos/MysqlHosCandidateRepositoryTest.php`

**Interfaces:**
- `HosCandidateRepository::eligibleFor(DateRange $range): Collection` returns a transport DTO, never an Eloquent HOSxP model.
- `CreateDeliveryRequest::handle(HosCandidate $candidate, User $pharmacist): DeliveryRequest` snapshots approved delivery data and rate.

- [ ] **Step 1: Write a failing feature test that a pharmacist can confirm a candidate but an HOSxP candidate alone never creates a Delivery Request.**

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `php artisan test tests/Feature/Pharmacy/ConfirmHosCandidateTest.php`  
Expected: FAIL because candidate adapter and confirmation action do not exist.

- [ ] **Step 3: Implement the HOSxP adapter against the `hos` connection and isolate legacy encoding conversion within the adapter.**

Configure eligibility rules rather than hard-coding service identifiers. Use a fake repository in automated tests; do not use a real HOSxP database in tests.

- [ ] **Step 4: Implement pharmacy confirmation UI and action, then verify only pharmacy/admin roles can create a request.**

- [ ] **Step 5: Run focused feature and adapter tests.**

Run: `php artisan test tests/Feature/Pharmacy/ConfirmHosCandidateTest.php tests/Unit/Domain/Hos/MysqlHosCandidateRepositoryTest.php`  
Expected: PASS.

- [ ] **Step 6: Commit HOSxP intake and pharmacy confirmation.**

```bash
git add platform
git commit -m "feat: create pharmacy-confirmed delivery requests"
```

### Task 5: Prepare packages, issue opaque QR codes, and expose pharmacy operations

**Files:**
- Create: `platform/app/Domain/Delivery/PrepareDeliveryAttempt.php`, `platform/app/Domain/Delivery/PackageQrToken.php`
- Create: `platform/app/Http/Controllers/PharmacyAttemptController.php`
- Create: `platform/resources/js/pages/pharmacy/PackagePreparationPage.vue`
- Test: `platform/tests/Feature/Pharmacy/PreparePackageTest.php`, `platform/tests/Unit/Domain/Delivery/PackageQrTokenTest.php`

**Interfaces:**
- `PrepareDeliveryAttempt::handle(DeliveryRequest $request, User $pharmacist): DeliveryAttempt` creates status `prepared` and one QR token.
- `PackageQrToken::issue(DeliveryAttempt $attempt, CarbonInterface $expiresAt): string` returns an opaque token.

- [ ] **Step 1: Write failing tests that preparation creates a single prepared attempt and a QR token contains no readable patient fields.**

- [ ] **Step 2: Run tests to verify they fail.**

Run: `php artisan test tests/Feature/Pharmacy/PreparePackageTest.php tests/Unit/Domain/Delivery/PackageQrTokenTest.php`  
Expected: FAIL because preparation and QR issuance are not implemented.

- [ ] **Step 3: Implement package preparation, token hashing/storage, expiration, Thai print view, and audit events.**

The printable QR resolves only through authenticated server endpoints. Re-printing invalidates the prior unused token and writes an audit event.

- [ ] **Step 4: Run preparation tests.**

Run: `php artisan test tests/Feature/Pharmacy/PreparePackageTest.php tests/Unit/Domain/Delivery/PackageQrTokenTest.php`  
Expected: PASS.

- [ ] **Step 5: Commit package QR preparation.**

```bash
git add platform
git commit -m "feat: prepare packages with opaque QR codes"
```

### Task 6: Implement atomic QR claim and rider delivery API

**Files:**
- Create: `platform/app/Domain/Delivery/ClaimPackageQr.php`, `platform/app/Http/Controllers/RiderClaimController.php`, `platform/app/Http/Resources/RiderAttemptResource.php`
- Modify: `platform/routes/api.php`, `platform/app/Policies/DeliveryAttemptPolicy.php`
- Test: `platform/tests/Feature/Rider/ClaimPackageQrTest.php`, `platform/tests/Feature/Rider/RiderAttemptResourceTest.php`

**Interfaces:**
- `ClaimPackageQr::handle(string $token, User $rider, CarbonInterface $claimedAt): DeliveryAttempt` uses a database transaction and conditional update.
- `POST /api/rider/claims` accepts `{ qr_token: string }` and returns `RiderAttemptResource`.

- [ ] **Step 1: Write failing concurrent-claim and invalid-token tests.**

```php
it('allows exactly one rider to claim a prepared QR', function () {
    // Execute two claim requests against the same token.
    // Assert one 201 response and one 409 response.
});
```

- [ ] **Step 2: Run focused tests to verify they fail.**

Run: `php artisan test tests/Feature/Rider/ClaimPackageQrTest.php`  
Expected: FAIL because the claim endpoint is absent.

- [ ] **Step 3: Implement atomic claim, expiry validation, rider-active validation, status transition, and audit event.**

Return 409 for an already claimed QR, 422 for expired/invalid QR, and never include patient data in failure responses.

- [ ] **Step 4: Implement the rider resource and test it returns permitted fields only to the claiming rider.**

- [ ] **Step 5: Run claim and resource tests.**

Run: `php artisan test tests/Feature/Rider/ClaimPackageQrTest.php tests/Feature/Rider/RiderAttemptResourceTest.php`  
Expected: PASS.

- [ ] **Step 6: Commit atomic rider claim.**

```bash
git add platform
git commit -m "feat: let riders claim prepared packages by QR"
```

### Task 7: Build Rider PWA offline evidence queue and idempotent sync

**Files:**
- Create: `platform/resources/js/pages/rider/RiderHomePage.vue`, `platform/resources/js/pages/rider/AttemptDetailPage.vue`
- Create: `platform/resources/js/offline/deliveryQueue.ts`, `platform/resources/js/offline/indexedDbStore.ts`, `platform/resources/js/offline/registerServiceWorker.ts`
- Create: `platform/app/Domain/Delivery/SyncOfflineEvent.php`, `platform/app/Http/Controllers/RiderSyncController.php`
- Test: `platform/tests/Feature/Rider/SyncOfflineEventTest.php`, `platform/resources/js/offline/deliveryQueue.test.ts`

**Interfaces:**
- `DeliveryQueue.enqueue(event: OfflineDeliveryEvent): Promise<void>` stores encrypted payload metadata, evidence blob reference, UUID, and device time.
- `POST /api/rider/sync-events` accepts an event UUID once and returns `{ event_id, server_received_at, status }`.
- `SyncOfflineEvent::handle(SyncEventData $event, User $rider): SyncResult` is idempotent by event UUID and rider ID.

- [ ] **Step 1: Write failing Vitest queue tests and a feature test that repeats the same sync UUID.**

```ts
it('keeps a queued delivery event until the server confirms it', async () => {
  await queue.enqueue(event);
  await queue.sync(failingClient);
  expect(await queue.pending()).toHaveLength(1);
});
```

- [ ] **Step 2: Run focused client and server tests to verify they fail.**

Run: `npm run test -- deliveryQueue.test.ts && php artisan test tests/Feature/Rider/SyncOfflineEventTest.php`  
Expected: FAIL because queue and sync endpoint are absent.

- [ ] **Step 3: Implement PWA install/service-worker registration, IndexedDB queue, retry strategy, evidence upload, and deletion after server acknowledgement.**

Store device-captured time and server-received time. Delivery success must not enter `delivered` until evidence fields are present; incomplete entries remain drafts.

- [ ] **Step 4: Implement idempotent server sync and rider ownership checks.**

- [ ] **Step 5: Run focused tests and Playwright mobile offline-to-online scenario.**

Run: `npm run test -- deliveryQueue.test.ts && php artisan test tests/Feature/Rider/SyncOfflineEventTest.php && npx playwright test rider-offline-sync`  
Expected: PASS.

- [ ] **Step 6: Commit Rider PWA offline sync.**

```bash
git add platform
git commit -m "feat: sync rider delivery evidence after offline work"
```

### Task 8: Handle failed delivery, returns, amendments, and sync conflicts

**Files:**
- Create: `platform/app/Domain/Delivery/RecordFailedDelivery.php`, `platform/app/Domain/Delivery/ReceiveMedicationReturn.php`, `platform/app/Domain/Delivery/AmendInTransitDelivery.php`, `platform/app/Domain/Delivery/ResolveSyncConflict.php`
- Create: `platform/app/Http/Controllers/OperationsExceptionController.php`
- Create: `platform/resources/js/pages/operations/ExceptionsPage.vue`
- Test: `platform/tests/Feature/Operations/FailedDeliveryReturnTest.php`, `platform/tests/Feature/Operations/InTransitAmendmentTest.php`, `platform/tests/Feature/Operations/SyncConflictTest.php`

**Interfaces:**
- `RecordFailedDelivery::handle(DeliveryAttempt $attempt, FailedDeliveryData $data, User $rider): DeliveryAttempt` transitions to `return_required`.
- `ReceiveMedicationReturn::handle(DeliveryAttempt $attempt, User $pharmacist): DeliveryAttempt` transitions to `returned`.
- `AmendInTransitDelivery::handle(DeliveryRequest $request, DeliveryAmendmentData $data, User $coordinator): AuditEvent` creates a versioned amendment.

- [ ] **Step 1: Write failing tests for a failed delivery requiring return, a retry receiving a new QR, and a coordinator amendment retaining old/new values.**

- [ ] **Step 2: Run focused tests to verify they fail.**

Run: `php artisan test tests/Feature/Operations/FailedDeliveryReturnTest.php tests/Feature/Operations/InTransitAmendmentTest.php tests/Feature/Operations/SyncConflictTest.php`  
Expected: FAIL because exception actions are absent.

- [ ] **Step 3: Implement standard failure reasons, same-day return confirmation, retry creation, amendments, and audit records.**

Do not automatically reject older offline evidence after an amendment. Mark it `sync_review`, present it to the coordinator, and preserve both data versions.

- [ ] **Step 4: Implement the coordinator exception queue and resolution action.**

- [ ] **Step 5: Run exception tests.**

Run: `php artisan test tests/Feature/Operations/FailedDeliveryReturnTest.php tests/Feature/Operations/InTransitAmendmentTest.php tests/Feature/Operations/SyncConflictTest.php`  
Expected: PASS.

- [ ] **Step 6: Commit delivery exception handling.**

```bash
git add platform
git commit -m "feat: manage delivery returns amendments and conflicts"
```

### Task 9: Build daily operations dashboards and immutable audit access

**Files:**
- Create: `platform/app/Http/Controllers/OperationsDashboardController.php`, `platform/app/Http/Controllers/AuditEventController.php`
- Create: `platform/resources/js/pages/operations/DashboardPage.vue`, `platform/resources/js/pages/operations/AuditPage.vue`
- Test: `platform/tests/Feature/Operations/DashboardMetricsTest.php`, `platform/tests/Feature/Audit/AuditReadOnlyTest.php`

**Interfaces:**
- `OperationsDashboardController::__invoke(OperationsFilter $filter): Response` returns counts for prepared, claimed/in-transit, delivered, and return-required work.
- `AuditEventController@index()` permits admin/auditor read only.

- [ ] **Step 1: Write failing dashboard-count and audit mutation-denial tests.**

- [ ] **Step 2: Run focused tests to verify they fail.**

Run: `php artisan test tests/Feature/Operations/DashboardMetricsTest.php tests/Feature/Audit/AuditReadOnlyTest.php`  
Expected: FAIL because dashboard and audit endpoints are absent.

- [ ] **Step 3: Implement filters by date, zone, rider, and status; implement immutable audit read views.**

Use normal API/model code paths without bulk updates that bypass audit actions.

- [ ] **Step 4: Run dashboard and audit tests.**

Run: `php artisan test tests/Feature/Operations/DashboardMetricsTest.php tests/Feature/Audit/AuditReadOnlyTest.php`  
Expected: PASS.

- [ ] **Step 5: Commit operations visibility.**

```bash
git add platform
git commit -m "feat: add operational dashboards and audit access"
```

### Task 10: Implement monthly payout review, reporting, and release verification

**Files:**
- Create: `platform/app/Domain/Payout/CreatePayoutPeriod.php`, `platform/app/Domain/Payout/ClosePayoutPeriod.php`, `platform/app/Domain/Payout/ApprovePayoutPeriod.php`
- Create: `platform/app/Http/Controllers/FinancePayoutController.php`, `platform/app/Exports/PayoutCsvExport.php`
- Create: `platform/resources/js/pages/finance/PayoutPeriodPage.vue`
- Test: `platform/tests/Feature/Finance/PayoutPeriodTest.php`, `platform/tests/Feature/Finance/PayoutCsvExportTest.php`, `platform/tests/Feature/Smoke/RoleWorkflowTest.php`

**Interfaces:**
- `CreatePayoutPeriod::handle(CarbonInterface $month, User $finance): PayoutPeriod` includes only delivered attempts with required proof and snapshots.
- `ClosePayoutPeriod::handle(PayoutPeriod $period, User $finance): PayoutPeriod` prevents line/rate mutation.
- `PayoutCsvExport::download(PayoutPeriod $period): StreamedResponse` exports only rider code, display name, request/attempt references, zone, rate, and totals.

- [ ] **Step 1: Write failing tests for eligible-only payout lines, snapshot rates, close immutability, and finance-only approval.**

- [ ] **Step 2: Run focused finance tests to verify they fail.**

Run: `php artisan test tests/Feature/Finance/PayoutPeriodTest.php tests/Feature/Finance/PayoutCsvExportTest.php`  
Expected: FAIL because payout actions and export are absent.

- [ ] **Step 3: Implement period generation, review, approval, closure, and CSV export.**

Do not add bank accounts, payment execution, or mutations to closed periods. An authorised exception for failed delivery must be an explicit, audited action.

- [ ] **Step 4: Add and run an end-to-end role workflow test.**

Run: `php artisan test tests/Feature/Smoke/RoleWorkflowTest.php`  
Expected: PASS for pharmacy preparation, rider QR claim, delivery evidence, operations review, and finance period closure.

- [ ] **Step 5: Run the complete verification set.**

Run: `php artisan test && npm run test && npx playwright test`  
Expected: PASS.

- [ ] **Step 6: Commit payout and release verification.**

```bash
git add platform
git commit -m "feat: close monthly rider payout periods"
```

## Coverage Review

The ten tasks cover every first-release specification area: HOSxP read-only intake (Task 4), pharmacy and QR workflow (Tasks 4–6), role-limited views (Task 2 and Task 6), offline rider operation (Task 7), returns/amendments/conflicts (Task 8), daily monitoring and immutable history (Task 9), and zone-based monthly payout/reporting (Tasks 3 and 10). Excluded features remain excluded from all tasks.

The only execution prerequisite outside this repository is access to a non-production HOSxP read-only connection and representative de-identified test data; the application must run all automated tests without either.
