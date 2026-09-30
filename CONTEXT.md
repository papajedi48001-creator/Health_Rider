# Health Rider — Ubiquitous Language

## Terms

**Delivery Request**
: A request to deliver medication to a patient's home, created only after the pharmacy has prepared the medication and approved it for home delivery.

**Delivery Zone**
: The municipality/subdistrict and village classification used to determine the rider's service rate. A zone has an effective-dated rate.

**Zone Rate**
: The per-delivery service rate assigned to a Delivery Zone. The rate applicable on dispatch is copied to the Delivery Request and is never changed retrospectively.

**Rider**
: A hospital staff member or contracted external courier authorised to take custody of a prepared medication delivery.

**Rider Delivery View**
: The data shown only to the Rider who has successfully claimed a package: patient full name, HN, age, telephone number, and delivery address. It excludes medication details and broader clinical history.

**Proof of Delivery**
: The time, privacy-preserving delivery photograph, and abbreviated recipient relationship required before a Delivery Request may be recorded as successfully delivered.

**Failed Delivery**
: An attempt that did not hand medication to the intended recipient. It is not a successful delivery and must record a standard reason for coordinator follow-up.

**Delivery Attempt**
: One QR-identified effort to deliver a package. A Failed Delivery followed by Medication Return creates a new Delivery Attempt with a new QR under the same Delivery Request; only a Payable Delivery is eligible for payment.

**Payout Period**
: A calendar-month collection of successfully delivered requests whose Zone Rates are checked by a coordinator, approved by finance, and then marked paid. A closed period is immutable.

**Payable Delivery**
: A delivery attempt that was successfully completed with required proof and therefore may enter a Payout Period. A Failed Delivery is not payable unless an authorised exception is recorded.

**HOS Source**
: The HOS system, which remains the read-only source for patient, prescription, and eligible medication information.

**Eligibility Rule**
: A configurable HOS-based rule that proposes a candidate for delivery. It never creates a Delivery Request without pharmacy confirmation.

**QR Claim**
: The assignment of a pharmacy-prepared package to an authenticated Rider when that Rider scans the package's unique QR code. No separate coordinator assignment or handover confirmation is required. The claim is atomic: after one successful scan, no other Rider can claim the same package.

**Medication Return**
: The same-day return of a package to pharmacy after a Failed Delivery, confirmed by both the Rider and pharmacy.

**In-Transit Amendment**
: A coordinator's authorised change to delivery data after a Rider has claimed a package. It records the old and new values, editor, time, and reason; it never overwrites the audit trail.

**Offline Delivery Event**
: A Rider's pickup or delivery record, including its evidence, stored securely on the Rider's device when no network is available and synchronised later. The audit trail preserves both device-captured time and server-received time.

**Online QR Claim**
: A QR Claim that may occur only while the server can atomically confirm that the package is unclaimed. Offline capability begins after a successful claim.

**Sync Conflict**
: A delivery event recorded offline against a delivery-data version that was later amended. The event and its evidence are retained and routed to the coordinator for review; they are not silently rejected.

**Package QR**
: An expiring, opaque random package identifier printed on a prepared package. It contains no patient or medication information and can be resolved only by the authenticated system.

**Audit Trail**
: An immutable chronological record of creation, amendments, QR claims, delivery attempts, medication returns, payout approvals, and payments. Users cannot delete these events.

**Patient Notification**
: An automated outbound message to a patient. Patient Notification is out of scope for the first release; staff may record a telephone contact made outside the system.

**Consent Workflow**
: A system workflow to collect or validate consent for home delivery. Consent Workflow is out of scope; it is not a prerequisite for creating a Delivery Request in this system.
