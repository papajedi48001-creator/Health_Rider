'use client';

import { useSyncExternalStore } from 'react';

export type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
export type InstallPlatform = 'ios' | 'android' | 'other';
export type InstallState = { installed: boolean; canPrompt: boolean };

// Chrome offers its install prompt once per page load, often before React has rendered, so the event is
// captured as soon as this module loads and shared by every install button and banner on the page.
let installEvent: InstallPromptEvent | null = null;
let installedNow = false;
let state: InstallState = { installed: false, canPrompt: false };
const listeners = new Set<() => void>();
const serverState: InstallState = { installed: false, canPrompt: false };

function update() {
  const next = { installed: installedNow || isInstalledApp(), canPrompt: installEvent !== null };
  if (next.installed === state.installed && next.canPrompt === state.canPrompt) return;
  state = next;
  listeners.forEach((listener) => listener());
}

export function isInstalledApp(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function installPlatform(): InstallPlatform {
  const agent = navigator.userAgent;
  // iPadOS reports itself as a Mac; a touch screen tells it apart.
  if (/iPhone|iPad|iPod/i.test(agent) || (/Macintosh/i.test(agent) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(agent)) return 'android';
  return 'other';
}

function startInstallCapture() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installEvent = event as InstallPromptEvent;
    update();
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    installedNow = true;
    update();
  });
}

startInstallCapture();

function subscribe(listener: () => void) {
  listeners.add(listener);
  update();
  return () => { listeners.delete(listener); };
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, () => state, () => serverState);
}

// Shows the browser's own install dialog; the prompt can be used only once, so it is cleared afterwards.
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = installEvent;
  if (!event) return 'unavailable';
  installEvent = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'accepted') installedNow = true;
  update();
  return outcome;
}
