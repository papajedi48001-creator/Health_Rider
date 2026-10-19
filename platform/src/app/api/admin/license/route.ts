import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { DomainError } from '@/domain/errors';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';
import { currentLicenseState, deliveriesThisMonth, installLicense } from '@/license/license-store';

export const dynamic = 'force-dynamic';

async function usage() {
  const [activeRiders, deliveries] = await Promise.all([
    db.user.count({ where: { role: 'rider', active: true, pendingApproval: false } }),
    deliveriesThisMonth(),
  ]);
  return { activeRiders, deliveriesThisMonth: deliveries, buildDate: process.env.NEXT_PUBLIC_BUILD_DATE ?? null };
}

// The license box on the settings page: what is installed, what it allows, and the build it is checked against.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'admin');
    return NextResponse.json({ license: await currentLicenseState(), ...await usage() });
  });
}

// Installs the license file the vendor sent; it works even in read-only mode so an expired install can be renewed.
export async function PUT(request: NextRequest) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const body = await readJsonBody(request) as { text?: unknown } | undefined;
    if (typeof body?.text !== 'string' || !body.text.trim()) throw new DomainError('โปรดเลือกไฟล์ license');
    const license = await installLicense(body.text, admin.id);
    return NextResponse.json({ license, ...await usage() });
  });
}
