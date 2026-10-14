# Health Rider UX Contract

## Sources

| Concern | Source |
| --- | --- |
| Rider access to claimed attempt only | `CONTEXT.md` — Rider Delivery View |
| Offline evidence and acknowledgement | `CONTEXT.md` — Offline Delivery Event |
| QR claim must be online and atomic | `CONTEXT.md` — Online QR Claim |

## Offline rider workflow

| Operation | Trigger | Pending/local state | Success | Failure/recovery |
| --- | --- | --- | --- | --- |
| Record pickup/delivery/failure | Rider presses labeled button (delivery needs a photo and recipient relationship; failure needs a standard reason) | “บันทึกไว้ในเครื่อง รอส่งเมื่อออนไลน์” | “บันทึกและส่งข้อมูลแล้ว” after acknowledgement | Keep encrypted event and retry when the device comes back online or the page reopens |
| Sync queued event | Rider records while online, the browser fires `online`, or the attempt page opens | Queue is retained in IndexedDB | Delete local record only after `acknowledged: true` | Do not delete; explain that sync is pending |
| Event recorded against an amended delivery | Server sees an older delivery version or a status that no longer allows the event | — | “ส่งข้อมูลแล้ว แต่ต้องรอผู้ประสานงานตรวจสอบก่อน” | Coordinator accepts or dismisses it on งานที่ต้องตรวจสอบ; the event and photo are kept either way |

## Canonical ownership

| Capability | Owner | Variant |
| --- | --- | --- |
| Offline queue | `src/pwa/offline-queue.ts` | rider evidence events |
| Local persistence | `src/pwa/indexeddb-store.ts` | encrypted event payloads |
| Evidence photo | `src/pwa/photo.ts` (re-encode, drops EXIF) and `src/evidence/photo-storage.ts` | JPEG on the evidence volume |
| Offline event rules | `src/domain/delivery/offline-event-rules.ts` | status transitions and conflicts |
| Status feedback | Rider attempt page live region | local/synced/review/error |
