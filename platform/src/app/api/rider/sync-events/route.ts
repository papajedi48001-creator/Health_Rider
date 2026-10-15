import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { parseOfflineEventDetails } from '@/domain/delivery/offline-event-rules';
import { newPublicId, type DeliveryAttemptStatus } from '@/domain/delivery/status';
import { closedAttemptStatuses, syncOfflineEvent } from '@/domain/delivery/sync-offline-event';
import { InvalidEvidencePhotoError, saveEvidencePhoto } from '@/evidence/photo-storage';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute, invalidInput } from '@/lib/route';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type IncomingEvent = { eventUuid: string; attemptId: string; deliveryVersion: number; eventType: string; deviceCapturedAt: string; payload: Record<string, unknown> };

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const rider = requireRole(await getSessionFromRequest(request), 'rider');
    const event = await readJsonBody(request);
    if (!validEvent(event)) return invalidInput('ข้อมูลการบันทึกออฟไลน์ไม่ถูกต้อง');
    const details = parseOfflineEventDetails(event.eventType, event.payload);
    const deviceCapturedAt = new Date(event.deviceCapturedAt);
    if (!details || Number.isNaN(deviceCapturedAt.getTime())) return invalidInput('ข้อมูลการบันทึกออฟไลน์ไม่ถูกต้อง');

    const owned = await db.deliveryAttempt.findFirst({ where: { id: event.attemptId, riderId: rider.id }, select: { id: true, status: true } });
    if (!owned) return NextResponse.json({ message: 'ไม่พบงานจัดส่ง' }, { status: 404 });
    // A resend of an acknowledged event, or any event for a finished job, stores no new photo.
    const alreadyRecorded = await db.offlineDeliveryEvent.findUnique({ where: { eventUuid_riderId: { eventUuid: event.eventUuid, riderId: rider.id } }, select: { id: true } });
    const acceptsPhoto = !alreadyRecorded && !closedAttemptStatuses.includes(owned.status);

    let photoPath: string | null = null;
    if (details.eventType === 'delivered' && acceptsPhoto) {
      if (typeof event.payload.photo !== 'string') return invalidInput('ต้องมีรูปหลักฐานการส่ง');
      try {
        photoPath = await saveEvidencePhoto(event.attemptId, event.eventUuid, event.payload.photo);
      } catch (error) {
        if (error instanceof InvalidEvidencePhotoError) return invalidInput(error.message);
        throw error;
      }
    }

    // Only the fields the event type defines are kept; the photo stays on the evidence volume.
    const { eventType: _eventType, ...storedPayload } = details;
    const outcome = await db.$transaction(async (tx) => syncOfflineEvent(
      { eventUuid: event.eventUuid, attemptId: event.attemptId, deliveryVersion: event.deliveryVersion, deviceCapturedAt, details, photoPath },
      rider,
      {
        findByUuid: (eventUuid, riderId) => tx.offlineDeliveryEvent.findUnique({ where: { eventUuid_riderId: { eventUuid, riderId } }, select: { id: true } }),
        lockRiderAttempt: async (attemptId, riderId) => {
          const locked = await tx.$queryRaw<Array<{ id: string; status: DeliveryAttemptStatus; deliveryVersion: number }>>`
            SELECT a.id, a.status, r.deliveryVersion FROM delivery_attempts a
            INNER JOIN delivery_requests r ON r.id = a.deliveryRequestId
            WHERE a.id = ${attemptId} AND a.riderId = ${riderId} FOR UPDATE`;
          return locked[0] ? { ...locked[0], deliveryVersion: Number(locked[0].deliveryVersion) } : null;
        },
        createEvent: (record) => tx.offlineDeliveryEvent.create({
          data: {
            id: newPublicId(), eventUuid: record.eventUuid, deliveryAttemptId: record.attemptId, riderId: record.riderId,
            deliveryVersion: record.deliveryVersion, eventType: record.details.eventType,
            payload: { ...storedPayload, ...(record.photoPath ? { photoPath: record.photoPath } : {}) } as Prisma.InputJsonValue,
            deviceCapturedAt: record.deviceCapturedAt, serverReceivedAt: record.serverReceivedAt,
          },
          select: { id: true },
        }),
        updateAttempt: (attemptId, update) => tx.deliveryAttempt.update({ where: { id: attemptId }, data: update }),
        createEvidence: (record) => tx.deliveryEvidence.create({ data: { id: newPublicId(), ...record } }),
        createConflict: (record) => tx.syncConflict.create({ data: { id: newPublicId(), ...record } }),
        createAudit: (entry) => audit(tx, { ...entry, auditableType: 'DeliveryAttempt' }),
      },
    ));

    return NextResponse.json({ acknowledged: true, duplicate: outcome.kind === 'duplicate', outcome });
  });
}

function validEvent(value: unknown): value is IncomingEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return typeof event.eventUuid === 'string' && uuidPattern.test(event.eventUuid)
    && typeof event.attemptId === 'string' && Number.isInteger(event.deliveryVersion)
    && typeof event.eventType === 'string' && typeof event.deviceCapturedAt === 'string'
    && !!event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload);
}
