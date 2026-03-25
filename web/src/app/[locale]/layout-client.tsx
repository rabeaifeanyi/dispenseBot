'use client';

import type { ReactNode } from 'react';
import { App as AntdApp, ConfigProvider } from 'antd';
import { antTheme } from '@/styles/ant-theme';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import ClientLayout from '@/components/ClientLayout';
import { DemoProvider } from '@/contexts/DemoContext';
import { ApiProvider } from '@/contexts/ApiContext';
import { i18n } from '@/lib/i18n';
import { useEffect } from 'react';

interface LocaleLayoutClientProps {
  children: ReactNode;
  locale: string;
}

export default function LocaleLayoutClient({
  children,
  locale,
}: LocaleLayoutClientProps) {
  useEffect(() => {
    i18n.setLocale(locale);
  }, [locale]);

  return (
    <AntdRegistry>
      <ConfigProvider theme={antTheme}>
        <AntdApp>
          <ApiProvider>
            <DemoProvider>
              <ClientLayout locale={locale}>{children}</ClientLayout>
            </DemoProvider>
          </ApiProvider>
        </AntdApp>
      </ConfigProvider>
    </AntdRegistry>
  );
}
