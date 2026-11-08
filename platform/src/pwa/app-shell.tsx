'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { appVersion } from '@/lib/app-version';
import { withBasePath } from '@/lib/base-path';
import { installPlatform, isInstalledApp, promptInstall, useInstallState } from '@/pwa/install-prompt';

const installDismissedKey = 'health-rider-install-dismissed';
const reloadedForKey = 'health-rider-reloaded-for';
const recheckAfterMs = 60_000;

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

// On every page: registers the service worker, invites Android browsers to install the app each time
// it is opened outside the app, and checks for a newer deployed version before and while it is used.
export function AppShell() {
  const { installed, canPrompt } = useInstallState();
  const [showInstall, setShowInstall] = useState(false);
  const [newVersion, setNewVersion] = useState(false);
  const lastCheck = useRef(0);

  useEffect(() => {
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register(withBasePath('/sw.js'), { scope: withBasePath('/') }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (installPlatform() !== 'android' || isInstalledApp()) return;
    // Dismissing hides the invitation until the app is opened again in a new tab.
    if (storage()?.getItem(installDismissedKey) !== '1') setShowInstall(true);
  }, []);

  const reload = useCallback(async () => {
    const registration = await navigator.serviceWorker?.getRegistration(withBasePath('/')).catch(() => undefined);
    await registration?.update().catch(() => undefined);
    window.location.reload();
  }, []);

  const check = useCallback(async (firstLoad: boolean) => {
    if (appVersion === 'development' || !navigator.onLine) return;
    if (!firstLoad && Date.now() - lastCheck.current < recheckAfterMs) return;
    lastCheck.current = Date.now();
    try {
      const response = await fetch(withBasePath('/api/version'), { cache: 'no-store' });
      if (!response.ok) return;
      const { version } = await response.json() as { version?: string };
      if (!version || version === appVersion) return;
      // Nothing has been typed yet when the page has just opened, so update straight away, but only once
      // per version in case a cache keeps serving the old page.
      if (firstLoad && storage()?.getItem(reloadedForKey) !== version) {
        storage()?.setItem(reloadedForKey, version);
        await reload();
        return;
      }
      setNewVersion(true);
    } catch {
      // Offline or the server is restarting: keep using the version already open.
    }
  }, [reload]);

  useEffect(() => {
    void check(true);
    const resumed = () => {
      if (document.visibilityState === 'visible') void check(false);
    };
    document.addEventListener('visibilitychange', resumed);
    window.addEventListener('online', resumed);
    return () => {
      document.removeEventListener('visibilitychange', resumed);
      window.removeEventListener('online', resumed);
    };
  }, [check]);

  async function install() {
    if (await promptInstall() === 'accepted') setShowInstall(false);
  }

  function dismissInstall() {
    storage()?.setItem(installDismissedKey, '1');
    setShowInstall(false);
  }

  const inviteInstall = showInstall && !installed;
  if (!newVersion && !inviteInstall) return null;

  return (
    <div className="app-banners">
      {newVersion && (
        <div className="app-banner" role="status">
          <span>มี ภูไทไรเดอร์ เวอร์ชันใหม่ กดอัปเดตก่อนใช้งานต่อ</span>
          <button type="button" className="btn btn-primary" onClick={() => void reload()}>อัปเดตเลย</button>
        </div>
      )}
      {inviteInstall && !newVersion && (
        <div className="app-banner" role="region" aria-label="ติดตั้งแอป">
          {canPrompt ? (
            <span>ติดตั้ง ภูไทไรเดอร์ ไว้ที่หน้าจอหลัก เปิดได้เร็วและใช้งานแบบแอป</span>
          ) : (
            <span>ติดตั้งแอป: กดเมนู ⋮ ของ Chrome แล้วเลือก &quot;ติดตั้งแอป&quot; หรือ &quot;เพิ่มลงในหน้าจอหลัก&quot; ถ้าติดตั้งแล้ว ให้เปิดจากไอคอน ภูไทไรเดอร์</span>
          )}
          {canPrompt && <button type="button" className="btn btn-primary" onClick={() => void install()}>ติดตั้ง</button>}
          <button type="button" className="btn btn-secondary" onClick={dismissInstall}>ไว้ทีหลัง</button>
        </div>
      )}
    </div>
  );
}
