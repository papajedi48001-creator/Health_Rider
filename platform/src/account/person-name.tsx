'use client';

import type { ReactNode } from 'react';
import { UserAvatar } from '@/account/user-avatar';

export type PersonRef = { id: string; displayName: string; avatarUpdatedAt?: string | null };

// A person's profile photo (or initial) followed by their name, used wherever staff see who did a job.
export function PersonName({ person, children }: { person: PersonRef; children?: ReactNode }) {
  return (
    <span className="person">
      <UserAvatar userId={person.id} name={person.displayName} version={person.avatarUpdatedAt ? Date.parse(person.avatarUpdatedAt) : null} inline />
      <span>{person.displayName}{children}</span>
    </span>
  );
}
