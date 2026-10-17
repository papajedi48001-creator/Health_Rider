export type PhoneLocation = { latitude: number; longitude: number; accuracyM: number };

// The phone's position for delivery evidence, or null when the rider declines, there is no fix, or it takes too long.
// A delivery never waits on GPS beyond the timeout.
export function currentLocation(timeoutMs = 8000): Promise<PhoneLocation | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const giveUp = setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(giveUp);
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyM: position.coords.accuracy });
      },
      () => {
        clearTimeout(giveUp);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
