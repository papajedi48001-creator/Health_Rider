import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { withBasePath } from '@/lib/base-path';
import './globals.css';

export const metadata: Metadata = {
  title: 'ระบบจัดการ Health Rider',
  description: 'ระบบบริหารการส่งยาถึงบ้าน โรงพยาบาลวาริชภูมิ',
  manifest: withBasePath('/manifest.webmanifest'),
  icons: { icon: withBasePath('/icon.svg') },
};

export const viewport: Viewport = {
  themeColor: '#007F8B',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
