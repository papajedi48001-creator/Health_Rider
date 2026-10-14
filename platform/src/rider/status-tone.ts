import type { DeliveryAttemptStatus } from '@/domain/delivery/status';

// Chip colours follow DESIGN.md: care for confirmed progress, warning for work that still needs a step, danger for intervention.
export function statusTone(status: DeliveryAttemptStatus): string {
  switch (status) {
    case 'delivered':
    case 'returned':
      return 'chip-success';
    case 'delivery_failed':
    case 'return_required':
      return 'chip-danger';
    case 'sync_review':
      return 'chip-warning';
    default:
      return 'chip-info';
  }
}
