import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { loadHosConfig, parseHosSettingsInput } from '@/hos/hos-settings';
import { testHosConnection } from '@/hos/mysql-candidate-repository';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// Tries the HOSxP settings in the form before they are saved; a blank password uses the one in effect now.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'admin');
    const { eligibleItemCodes, ...connection } = parseHosSettingsInput(await readJsonBody(request), await loadHosConfig(process.env, db.systemSetting));
    return NextResponse.json(await testHosConnection(connection, eligibleItemCodes));
  });
}
