import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { UnauthorizedError } from '@/auth/require-role';
import { DomainError } from '@/domain/errors';

// Maps expected failures to JSON responses; anything else is a server error and is rethrown.
export async function handleRoute(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ message: error.message }, { status: 403 });
    if (error instanceof DomainError) return NextResponse.json({ message: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ message: 'รายการนี้ถูกบันทึกไว้แล้ว' }, { status: 409 });
    }
    throw error;
  }
}

export function invalidInput(message: string) {
  return NextResponse.json({ message }, { status: 422 });
}
