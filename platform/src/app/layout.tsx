import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'ระบบจัดการ Health Rider',
  description: 'ระบบบริหารการส่งยาถึงบ้าน โรงพยาบาลวาริชภูมิ',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
