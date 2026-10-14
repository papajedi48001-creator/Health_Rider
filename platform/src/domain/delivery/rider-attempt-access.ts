type RiderAttempt = {
  id: string;
  riderId: string | null;
  status: string;
  deliveryRequest: {
    hn: string;
    patientName: string;
    patientAge: number | null;
    telephone: string | null;
    deliveryAddress: string;
    deliveryVersion: number;
  };
};

type AttemptReader = {
  findById(attemptId: string): Promise<RiderAttempt | null>;
};

export async function canViewRiderAttempt(
  userId: string,
  attemptId: string,
  reader: AttemptReader,
): Promise<boolean> {
  const attempt = await reader.findById(attemptId);
  return attempt?.riderId === userId;
}

export function toRiderAttemptView(attempt: RiderAttempt) {
  return {
    id: attempt.id,
    status: attempt.status,
    deliveryVersion: attempt.deliveryRequest.deliveryVersion,
    patient: {
      hn: attempt.deliveryRequest.hn,
      name: attempt.deliveryRequest.patientName,
      age: attempt.deliveryRequest.patientAge,
      telephone: attempt.deliveryRequest.telephone,
      address: attempt.deliveryRequest.deliveryAddress,
    },
  };
}
