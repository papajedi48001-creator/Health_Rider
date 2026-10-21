'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/brand/icons';
import { installPlatform, promptInstall, useInstallState, type InstallPlatform } from '@/pwa/install-prompt';

const steps: Record<InstallPlatform, string[]> = {
  ios: [
    'เปิดหน้านี้ด้วย Safari (ถ้าเปิดจาก LINE ให้กด ⋯ แล้วเลือกเปิดใน Safari ก่อน)',
    'แตะปุ่มแชร์ (สี่เหลี่ยมมีลูกศรชี้ขึ้น) ที่แถบด้านล่างหรือด้านบนของ Safari',
    'เลื่อนลงแล้วเลือก "เพิ่มไปยังหน้าจอโฮม" จากนั้นแตะ "เพิ่ม"',
  ],
  android: [
    'เปิดหน้านี้ด้วย Chrome',
    'แตะเมนู ⋮ ที่มุมขวาบน',
    'เลือก "ติดตั้งแอป" หรือ "เพิ่มลงในหน้าจอหลัก" ถ้าติดตั้งแล้ว ให้เปิดจากไอคอน Health Rider',
  ],
  other: [
    'เปิดหน้านี้ด้วย Chrome หรือ Edge',
    'กดไอคอนติดตั้งที่ท้ายช่องที่อยู่เว็บ หรือเมนู ⋮ แล้วเลือก "ติดตั้ง Health Rider"',
  ],
};

// A standing install button for the rider screens. Chrome on Android installs in one tap; iPhone Safari has
// no install prompt for web pages, so the button shows the Add to Home Screen steps instead.
export function InstallAppButton() {
  const { installed, canPrompt } = useInstallState();
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => setPlatform(installPlatform()), []);

  if (installed || platform === null) return null;

  async function install() {
    if (canPrompt && await promptInstall() !== 'unavailable') return;
    setShowSteps((shown) => !shown);
  }

  return (
    <section className="rider-card install-card" aria-label="ติดตั้งแอป">
      <h2><Icon name="download" /> ติดตั้งแอป Health Rider</h2>
      <p className="muted">ติดตั้งไว้ที่หน้าจอหลัก เปิดได้เร็ว เต็มจอเหมือนแอป และเปิดงานที่รับไว้ได้แม้สัญญาณไม่ดี</p>
      <button type="button" className="btn btn-primary btn-block" aria-expanded={canPrompt ? undefined : showSteps} onClick={() => void install()}>
        <Icon name="download" /> ติดตั้งแอป
      </button>
      {showSteps && (
        <ol className="install-steps">
          {steps[platform].map((step) => <li key={step}>{step}</li>)}
        </ol>
      )}
    </section>
  );
}
