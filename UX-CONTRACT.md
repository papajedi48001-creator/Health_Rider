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
| Record pickup/delivery | Rider presses labeled button | “บันทึกไว้ในเครื่อง รอส่งเมื่อออนไลน์” | “บันทึกและส่งข้อมูลแล้ว” after acknowledgement | Keep encrypted event and retry on a later online action |
| Sync queued event | Rider records while online | Queue is retained | Delete local record only after `acknowledged: true` | Do not delete; explain that sync is pending |

## Canonical ownership

| Capability | Owner | Variant |
| --- | --- | --- |
| Offline queue | `src/pwa/offline-queue.ts` | rider evidence events |
| Local persistence | `src/pwa/indexeddb-store.ts` | encrypted event payloads |
| Status feedback | Rider attempt page live region | local/synced/error |
