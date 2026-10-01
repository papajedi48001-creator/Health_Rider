import { NextRequest, NextResponse } from 'next/server';
import { requireRole, UnauthorizedError } from '@/auth/require-role';
import { getSessionFromRequest } from '@/auth/session';
import { db } from '@/lib/db';
export async function GET(request: NextRequest) { try { requireRole(getSessionFromRequest(request), 'finance', 'admin', 'auditor'); return NextResponse.json(await db.payoutPeriod.findMany({ include: { lines: true }, orderBy: { month: 'desc' } })); } catch (error) { if (error instanceof UnauthorizedError) return NextResponse.json({ message: error.message }, { status: 403 }); throw error; } }
