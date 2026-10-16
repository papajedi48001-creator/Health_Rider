import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { hosSettingKey, loadHosConfig, parseHosSettingsInput, publicHosSettings, sealHosSettings } from '@/hos/hos-settings';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';
import { systemInfo } from '@/lib/system-info';

export const dynamic = 'force-dynamic';

// The settings page: HOSxP settings an admin can change, and read-only facts about the .env settings.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'admin');
    const hos = publicHosSettings(await loadHosConfig(process.env, db.systemSetting));
    return NextResponse.json({ hos, system: await systemInfo() });
  });
}

// Saves the HOSxP settings; from then on they win over HOS_DATABASE_URL and HOS_ELIGIBLE_ITEM_CODES in .env.
export async function PUT(request: NextRequest) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const current = await loadHosConfig(process.env, db.systemSetting);
    const body = await readJsonBody(request);
    const input = parseHosSettingsInput(body, current);
    const value = sealHosSettings(input, process.env);
    const { password: _password, ...shown } = input;
    const typedPassword = typeof (body as { password?: unknown } | undefined)?.password === 'string' && Boolean((body as { password: string }).password);

    await db.$transaction(async (tx) => {
      await tx.systemSetting.upsert({
        where: { key: hosSettingKey },
        create: { key: hosSettingKey, value, updatedById: admin.id },
        update: { value, updatedById: admin.id },
      });
      await audit(tx, {
        actorId: admin.id, action: 'system_setting.updated', auditableType: 'SystemSetting', auditableId: hosSettingKey,
        oldValues: publicHosSettings(current), newValues: { ...shown, passwordChanged: typedPassword },
      });
    });
    return NextResponse.json({ hos: publicHosSettings(await loadHosConfig(process.env, db.systemSetting)) });
  });
}

// Removes the saved HOSxP settings so the app goes back to the values in .env.
export async function DELETE(request: NextRequest) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    await db.$transaction(async (tx) => {
      const removed = await tx.systemSetting.deleteMany({ where: { key: hosSettingKey } });
      if (removed.count > 0) {
        await audit(tx, { actorId: admin.id, action: 'system_setting.reset', auditableType: 'SystemSetting', auditableId: hosSettingKey });
      }
    });
    return NextResponse.json({ hos: publicHosSettings(await loadHosConfig(process.env, db.systemSetting)) });
  });
}
