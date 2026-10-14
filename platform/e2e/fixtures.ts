import { PrismaClient } from '@prisma/client';
import { ulid } from 'ulidx';
import { deflateSync } from 'node:zlib';

// Browser tests create Delivery Requests directly because HOS is not available in test environments.
const prisma = new PrismaClient();

export async function createDeliveryRequest(patientName: string) {
  const [pharmacist, zone] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { username: 'pharmacy.uat' } }),
    prisma.deliveryZone.findFirstOrThrow({ where: { active: true } }),
  ]);
  return prisma.deliveryRequest.create({
    data: {
      id: ulid(), hosVisitNumber: `E2E-${ulid()}`, hn: `E2E-${Date.now()}`, patientName, patientAge: 70,
      telephone: '0800000000', deliveryAddress: 'บ้านทดสอบ E2E หมู่ 1', deliveryZoneId: zone.id, createdById: pharmacist.id,
    },
  });
}

export async function attemptStatus(attemptId: string) {
  return (await prisma.deliveryAttempt.findUniqueOrThrow({ where: { id: attemptId } })).status;
}

// A small valid PNG; the rider app re-encodes it to JPEG before storing it.
export const samplePhoto = { name: 'evidence.png', mimeType: 'image/png', buffer: solidPng(64, 48) };

function solidPng(width: number, height: number): Buffer {
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x80)]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
