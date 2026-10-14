import { DomainError } from '@/domain/errors';
import type { SessionUser } from '@/auth/require-role';
import { requireRole } from '@/auth/require-role';
import { newPublicId } from '@/domain/delivery/status';
import type { HosCandidate } from '@/hos/types';

export type ConfirmedDeliveryRequest = {
  id: string;
  hosVisitNumber: string | null;
  hn: string;
  patientName: string;
  patientAge: number | null;
  telephone: string | null;
  deliveryAddress: string;
  deliveryZoneId: string;
  createdById: string;
};

type ConfirmationStore = {
  findZone(codes: { subdistrictCode: string; villageCode: string }): Promise<{ id: string } | null>;
  createRequest(request: ConfirmedDeliveryRequest): Promise<ConfirmedDeliveryRequest>;
};

export async function confirmCandidate(
  candidate: HosCandidate,
  pharmacist: SessionUser | null,
  store: ConfirmationStore,
): Promise<ConfirmedDeliveryRequest> {
  const actor = requireRole(pharmacist, 'pharmacy', 'admin');
  const zone = await store.findZone({
    subdistrictCode: candidate.subdistrictCode,
    villageCode: candidate.villageCode,
  });

  if (!zone) {
    throw new DomainError('ไม่พบโซนจัดส่งสำหรับที่อยู่ผู้ป่วย');
  }

  return store.createRequest({
    id: newPublicId(),
    hosVisitNumber: candidate.visitNumber,
    hn: candidate.hn,
    patientName: candidate.patientName,
    patientAge: candidate.patientAge,
    telephone: candidate.telephone,
    deliveryAddress: candidate.deliveryAddress,
    deliveryZoneId: zone.id,
    createdById: actor.id,
  });
}
