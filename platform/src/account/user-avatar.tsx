'use client';

import { useState } from 'react';
import { withBasePath } from '@/lib/base-path';

// The user's profile photo, or the first letter of their name when they have none (or it fails to load).
export function UserAvatar({ userId, name, version, small = false }: { userId: string; name: string; version?: number | null; small?: boolean }) {
  const [failed, setFailed] = useState<number | null>(null);
  const className = `avatar${small ? ' avatar-small' : ''}`;
  if (!version || failed === version) return <span className={className} aria-hidden="true">{name.trim().charAt(0)}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a private image served by our own API
    <img className={`${className} avatar-photo`} src={withBasePath(`/api/users/${userId}/avatar?v=${version}`)} alt="" onError={() => setFailed(version)} />
  );
}
