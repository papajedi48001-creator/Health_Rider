import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { labelSettingKey, loadLabelSettings, parseLabelSettings } from '@/domain/settings/label-layout';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// The label and paper sizes in effect; pharmacy reads them to print, admins to change them.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    return NextResponse.json(await loadLabelSettings(db.systemSetting));
  });
}

export async function PUT(request: NextRequest) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const value = parseLabelSettings(await readJsonBody(request));
    const current = await loadLabelSettings(db.systemSetting);
    await db.$transaction(async (tx) => {
      await tx.systemSetting.upsert({
        where: { key: labelSettingKey },
        create: { key: labelSettingKey, value, updatedById: admin.id },
        update: { value, updatedById: admin.id },
      });
      await audit(tx, {
        actorId: admin.id, action: 'system_setting.updated', auditableType: 'SystemSetting', auditableId: labelSettingKey,
        oldValues: current.settings, newValues: value,
      });
    });
    return NextResponse.json({ settings: value, saved: true });
  });
}

// Goes back to the standard 90 × 65 mm labels on A4.
export async function DELETE(request: NextRequest) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    await db.$transaction(async (tx) => {
      const removed = await tx.systemSetting.deleteMany({ where: { key: labelSettingKey } });
      if (removed.count > 0) {
        await audit(tx, { actorId: admin.id, action: 'system_setting.reset', auditableType: 'SystemSetting', auditableId: labelSettingKey });
      }
    });
    return NextResponse.json(await loadLabelSettings(db.systemSetting));
  });
}
