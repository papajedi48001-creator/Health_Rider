import { NextRequest, NextResponse } from 'next/server';
import { requireRole, UnauthorizedError } from '@/auth/require-role';
import { getSessionFromRequest } from '@/auth/session';
import { db } from '@/lib/db';
export async function GET(request: NextRequest) { try { requireRole(getSessionFromRequest(request), 'coordinator', 'admin', 'auditor'); const status = request.nextUrl.searchParams.get('status') ?? undefined; const attempts = await db.deliveryAttempt.findMany({ where: status ? { status: status as never } : undefined, select: { id: true, status: true, riderId: true, createdAt: true } }); return NextResponse.json({ attempts }); } catch (error) { if (error instanceof UnauthorizedError) return NextResponse.json({ message: error.message }, { status: 403 }); throw error; } }
