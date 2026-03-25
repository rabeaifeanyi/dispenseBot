import type { Metadata } from 'next';
import './globals.css';
import '@/styles/ant-overrides.css';

export const metadata: Metadata = {
  title: 'Kommisionierautomat',
  description: 'Web-controlled picking machine for pen components',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
