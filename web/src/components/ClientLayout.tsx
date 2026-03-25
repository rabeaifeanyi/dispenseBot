'use client';

import { useState } from 'react';
import { Layout, Button, Modal, Input, App } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import {
  HomeOutlined,
  ToolOutlined,
  ShoppingOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { useRouter, usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { i18n } from '@/lib/i18n';
import { useDemo } from '@/contexts/DemoContext';

const { Content } = Layout;
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 Minuten

function isAdminAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  const savedAuth = localStorage.getItem('admin_authenticated');
  const savedTime = localStorage.getItem('admin_last_activity');
  if (savedAuth !== 'true' || !savedTime) return false;
  const timeSinceActivity = Date.now() - parseInt(savedTime, 10);
  return timeSinceActivity < INACTIVITY_TIMEOUT;
}

interface ClientLayoutProps {
  children: ReactNode;
  locale?: string;
}

function getNavigationItems(locale: string = 'de') {
  return [
    {
      key: `/${locale}`,
      icon: <HomeOutlined />,
      label: i18n.t('app.navigation.home'),
    },
    {
      key: `/${locale}/order-history`,
      icon: <ShoppingOutlined />,
      label: i18n.t('app.navigation.orderHistory'),
    },
    {
      key: `/${locale}/orders`,
      icon: <DatabaseOutlined />,
      label: i18n.t('app.navigation.orders'),
    },
    {
      key: `/${locale}/admin`,
      icon: <ToolOutlined />,
      label: i18n.t('app.navigation.admin'),
    },
  ];
}

export default function ClientLayout({
  children,
  locale = 'de',
}: ClientLayoutProps) {
  const navigationItems = getNavigationItems(locale);
  const { message } = App.useApp();
  const router = useRouter();
  const pathname = usePathname();
  const { isDemo } = useDemo();
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);

  const handleAdminNavClick = () => {
    if (isDemo || isAdminAuthenticated()) {
      router.push(`/${locale}/admin`);
      return;
    }
    setAdminPassword('');
    setAdminModalOpen(true);
  };

  const handleAdminModalOk = async () => {
    setAdminLoginLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });

      if (res.ok) {
        const now = Date.now();
        localStorage.setItem('admin_authenticated', 'true');
        localStorage.setItem('admin_last_activity', now.toString());
        message.success(i18n.t('auth.success'));
        setAdminModalOpen(false);
        setAdminPassword('');
        router.push(`/${locale}/admin`);
      } else {
        message.error(i18n.t('auth.wrongPassword'));
        setAdminPassword('');
      }
    } catch {
      message.error('Verbindungsfehler – API nicht erreichbar');
      setAdminPassword('');
    } finally {
      setAdminLoginLoading(false);
    }
  };

  const handleAdminModalCancel = () => {
    setAdminModalOpen(false);
    setAdminPassword('');
  };

  return (
    <>
      <Layout
        style={{ minHeight: '100vh', background: 'var(--color-background)' }}
      >
        <Content
          style={{
            paddingLeft: 'var(--space-sm)',
            paddingRight: 'var(--space-sm)',
            paddingTop: 'var(--space-xl)',
            paddingBottom: 'var(--space-lg)',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div className="page-wrapper">
            <div className="top-nav-buttons">
              {navigationItems.map((item) => {
                const active = pathname === item.key;
                const isAdmin = item.key.endsWith('/admin');
                return (
                  <Button
                    key={item.key}
                    icon={item.icon}
                    type="default"
                    onClick={() =>
                      isAdmin ? handleAdminNavClick() : router.push(item.key)
                    }
                    className={active ? 'nav-btn nav-btn-active' : 'nav-btn'}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </div>

            <div className="page-content">{children}</div>
          </div>
        </Content>
      </Layout>

      <Modal
        title="Anmeldung"
        open={adminModalOpen}
        onOk={handleAdminModalOk}
        onCancel={handleAdminModalCancel}
        okText="Anmelden"
        cancelText="Abbrechen"
        okButtonProps={{ loading: adminLoginLoading }}
        cancelButtonProps={{ disabled: adminLoginLoading }}
      >
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <Input.Password
            placeholder="Admin-Passwort eingeben"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            onPressEnter={handleAdminModalOk}
            size="large"
            prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
          />
        </div>
      </Modal>
      <style jsx global>{`
        .page-wrapper {
          width: 100%;
          max-width: 960px;
        }

        .page-content {
          margin-top: var(--space-xl);
        }

        .top-nav-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-sm);
        }

        @media (max-width: 768px) {
          .top-nav-buttons {
            justify-content: center;
          }

          .top-nav-buttons .ant-btn {
            flex: 1 1 48%;
            justify-content: center;
          }
        }
      `}</style>
    </>
  );
}
