import type { Metadata } from 'next';
import { Roboto_Flex } from 'next/font/google';
import { App as AntdApp, ConfigProvider } from 'antd';
import './globals.css';
import '@/styles/ant-overrides.css';
import { antTheme } from '@/styles/ant-theme';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import ClientLayout from '@/components/ClientLayout';
import { DemoProvider } from '@/contexts/DemoContext';
import { ApiProvider } from '@/contexts/ApiContext';

const robotoFlex = Roboto_Flex({
  subsets: ['latin'],
  variable: '--font-roboto-flex',
});

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
  return (
    <html lang="de">
      <body className={robotoFlex.variable}>
        <AntdRegistry>
          <ConfigProvider theme={antTheme}>
            <AntdApp>
              <ApiProvider>
                <DemoProvider>
                  <ClientLayout>{children}</ClientLayout>
                </DemoProvider>
              </ApiProvider>
            </AntdApp>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
