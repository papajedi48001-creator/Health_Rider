import { Mascot } from '@/brand/mascot';

// An empty queue shows the mascot so a cleared list reads as done rather than broken.
export function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <Mascot width={150} />
      <p>{text}</p>
    </div>
  );
}
