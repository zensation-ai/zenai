import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ZenSation - Enterprise AI Platform',
  description: 'Intelligente KI-Loesungen fuer Ihr Unternehmen',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
