import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'ORACLE Trading Intelligence',
  description: 'Production-ready ORACLE dashboard'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
