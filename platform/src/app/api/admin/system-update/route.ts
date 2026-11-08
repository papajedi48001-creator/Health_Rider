import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { newPublicId } from '@/domain/delivery/status';
import { DomainError } from '@/domain/errors';
import { bundledManifest, runningRelease } from '@/domain/system-update/bundled-release';
import { compareVersions, firstUpdatableVersion, planVersionChange, type ReleaseManifest } from '@/domain/system-update/releases';
import { cancelUpdaterRequest, readUpdaterState, updaterStatePath, writeUpdaterRequest, type UpdaterState } from '@/domain/system-update/updater-channel';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store, max-age=0' };

// Versions the host can install come from status.json (the newest git tag's manifest, so it includes
// versions newer than this build); before the host has reported, this build's own manifest is shown.
function installable(state: UpdaterState): ReleaseManifest {
  const host = state.status;
  if (host?.rollbackFloor && host.releases.length > 0) return { rollbackFloor: host.rollbackFloor, releases: host.releases };
  return bundledManifest;
}

function view(state: UpdaterState) {
  const manifest = installable(state);
  const current = runningRelease.version;
  const busy = Boolean(state.pending) || state.status?.job?.state === 'running' || state.status?.job?.state === 'queued';
  return {
    current: runningRelease,
    rollbackFloor: compareVersions(manifest.rollbackFloor, firstUpdatableVersion) >= 0 ? manifest.rollbackFloor : firstUpdatableVersion,
    releases: manifest.releases.map((release) => {
      const order = compareVersions(release.version, current);
      return { ...release, relation: order === 0 ? 'current' : order > 0 ? 'newer' : 'older' };
    }),
    updater: {
      configured: state.configured,
      writable: state.writable,
      reporting: Boolean(state.status) && !state.stale,
      checkedAt: state.status?.checkedAt ?? null,
      fetchedAt: state.status?.fetchedAt ?? null,
      fetchError: state.status?.fetchError ?? null,
      deployedRef: state.status?.deployedRef ?? null,
    },
    busy,
    pending: state.pending,
    job: state.status?.job ?? null,
    history: state.status?.history ?? [],
  };
}

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'admin');
    return NextResponse.json(view(await readUpdaterState(updaterStatePath())), { headers: noStore });
  });
}

// Asks the host to install a version (update or rollback), or to look for new versions now.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const body = (await readJsonBody(request) ?? {}) as { action?: unknown; version?: unknown; reason?: unknown };
    const folder = updaterStatePath();
    const state = await readUpdaterState(folder);
    if (!state.configured) throw new DomainError('ยังไม่ได้ติดตั้งตัวอัปเดตบนเซิร์ฟเวอร์ ดูวิธีติดตั้งในคู่มือการอัปเดตระบบ', 503);
    if (view(state).busy) throw new DomainError('มีคำสั่งที่กำลังทำหรือรออยู่ โปรดรอให้เสร็จก่อน', 409);

    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
    const requestedBy = { id: admin.id, name: admin.displayName };
    const requestedAt = new Date().toISOString();

    if (body.action === 'check') {
      await writeUpdaterRequest(folder, { id: newPublicId(), action: 'check', version: null, from: null, reason: null, requestedAt, requestedBy });
      return NextResponse.json(view(await readUpdaterState(folder)), { status: 202, headers: noStore });
    }

    if (state.stale) throw new DomainError('ตัวอัปเดตบนเซิร์ฟเวอร์ไม่ได้รายงานสถานะเกิน 3 นาที โปรดตรวจสอบ health-rider-updater.timer ก่อนสั่งเปลี่ยนเวอร์ชัน', 503);
    const change = planVersionChange(installable(state), runningRelease.version, body.version);
    if (!reason) throw new DomainError(change.action === 'rollback' ? 'โปรดระบุเหตุผลที่ย้อนกลับเวอร์ชัน' : 'โปรดระบุเหตุผลหรือหมายเหตุของการอัปเดต', 422);

    const id = newPublicId();
    await writeUpdaterRequest(folder, { id, action: change.action, version: change.to, from: change.from, reason, requestedAt, requestedBy });
    await audit(db, {
      actorId: admin.id, action: `system.${change.action}_requested`, auditableType: 'SystemVersion', auditableId: change.to,
      reason, oldValues: { version: change.from }, newValues: { version: change.to, requestId: id, crossesSchemaChange: change.crossesSchemaChange },
    });
    return NextResponse.json(view(await readUpdaterState(folder)), { status: 202, headers: noStore });
  });
}

// Withdraws a request the host has not taken yet.
export async function DELETE(request: NextRequest) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const folder = updaterStatePath();
    const cancelled = await cancelUpdaterRequest(folder);
    if (cancelled && cancelled.action !== 'check' && cancelled.version) {
      await audit(db, {
        actorId: admin.id, action: 'system.version_change_cancelled', auditableType: 'SystemVersion', auditableId: cancelled.version,
        newValues: { requestId: cancelled.id },
      });
    }
    return NextResponse.json(view(await readUpdaterState(folder)), { headers: noStore });
  });
}
