import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { withBasePath } from '@/lib/base-path';
import { AppShell } from '@/pwa/app-shell';
import { DeveloperCredit } from '@/brand/developer-credit';
import './globals.css';

export const metadata: Metadata = {
  title: 'ระบบจัดการ Health Rider',
  description: 'ระบบบริหารการส่งยาถึงบ้าน โรงพยาบาลวาริชภูมิ',
  manifest: withBasePath('/manifest.webmanifest'),
  icons: { icon: withBasePath('/icon.svg'), apple: withBasePath('/icon-192.png') },
};

export const viewport: Viewport = {
  themeColor: '#007F8B',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="th">
      <body>
        <AppShell />
        {children}
        <DeveloperCredit />
      </body>
    </html>
  );
}
