import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireRole, UnauthorizedError } from '@/auth/require-role';
import { getSessionFromRequest } from '@/auth/current-session';
import { syncOfflineEvent } from '@/domain/delivery/sync-offline-event';
import { newPublicId } from '@/domain/delivery/status';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';

export async function POST(request: NextRequest) {
  try {
    const rider = requireRole(await getSessionFromRequest(request), 'rider');
    const event = await readJsonBody(request);
    if (!validEvent(event)) return NextResponse.json({ message: 'ข้อมูลการบันทึกออฟไลน์ไม่ถูกต้อง' }, { status: 422 });
    const attempt = await db.deliveryAttempt.findFirst({ where: { id: event.attemptId, riderId: rider.id }, select: { id: true } });
    if (!attempt) return NextResponse.json({ message: 'ไม่พบงานจัดส่ง' }, { status: 404 });
    const result = await syncOfflineEvent(event, rider, {
      findByUuid: (eventUuid, riderId) => db.offlineDeliveryEvent.findUnique({ where: { eventUuid_riderId: { eventUuid, riderId } } }),
      create: (record) => db.offlineDeliveryEvent.create({ data: { id: newPublicId(), eventUuid: record.eventUuid, deliveryAttemptId: record.attemptId, riderId: record.riderId, deliveryVersion: record.deliveryVersion, eventType: record.eventType, payload: record.payload as Prisma.InputJsonValue, deviceCapturedAt: new Date(record.deviceCapturedAt), serverReceivedAt: record.serverReceivedAt } }),
    });
    return NextResponse.json({ acknowledged: true, duplicate: result.kind === 'duplicate' });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ message: error.message }, { status: 403 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NextResponse.json({ acknowledged: true, duplicate: true });
    throw error;
  }
}

function validEvent(value: unknown): value is { eventUuid: string; attemptId: string; deliveryVersion: number; eventType: string; deviceCapturedAt: string; payload: Record<string, unknown> } {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return typeof event.eventUuid === 'string' && typeof event.attemptId === 'string' && Number.isInteger(event.deliveryVersion) && typeof event.eventType === 'string' && typeof event.deviceCapturedAt === 'string' && !!event.payload && typeof event.payload === 'object';
}
