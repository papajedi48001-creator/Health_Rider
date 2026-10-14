import { RiderAttempt } from '@/app/(rider)/rider/attempts/[attemptId]/rider-attempt';

export default async function RiderAttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <RiderAttempt attemptId={attemptId} />;
}
