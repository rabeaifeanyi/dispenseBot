import type { ReactNode } from 'react';
import { Roboto_Flex } from 'next/font/google';
import LocaleLayoutClient from './layout-client';

const robotoFlex = Roboto_Flex({
  subsets: ['latin'],
  variable: '--font-roboto-flex',
});

interface LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  return (
    <html lang={locale}>
      <body className={robotoFlex.variable}>
        <LocaleLayoutClient locale={locale}>{children}</LocaleLayoutClient>
      </body>
    </html>
  );
}
