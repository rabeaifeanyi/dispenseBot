'use client';

import { useState, useEffect, useCallback } from 'react';
import InventoryDashboard from '@/components/InventoryDashboard';
import { Button, message } from 'antd';
import { LogoutOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useRouter, usePathname } from 'next/navigation';
import { spacing } from '@/styles/spacing';
import { i18n } from '@/lib/i18n';

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes

export default function AdminPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [inventurOpen, setInventurOpen] = useState(false);

  useEffect(() => {
    const savedAuth = localStorage.getItem('admin_authenticated');
    const savedTime = localStorage.getItem('admin_last_activity');

    if (savedAuth === 'true' && savedTime) {
      const timeSinceActivity = Date.now() - parseInt(savedTime, 10);
      if (timeSinceActivity < INACTIVITY_TIMEOUT) {
        setIsAuthenticated(true);
        setLastActivity(Date.now());
      } else {
        localStorage.removeItem('admin_authenticated');
        localStorage.removeItem('admin_last_activity');
        message.warning(i18n.t('adminPage.loggedOutInactivity'));
        const locale = pathname.split('/')[1];
        router.replace(`/${locale}`);
        return;
      }
    } else {
      const locale = pathname.split('/')[1];
      router.replace(`/${locale}`);
      return;
    }
    setIsLoading(false);
  }, [router, pathname]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const checkInactivity = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivity;
      if (timeSinceActivity >= INACTIVITY_TIMEOUT) {
        handleLogout(true);
      }
    }, 60000);

    return () => clearInterval(checkInactivity);
  }, [isAuthenticated, lastActivity]);

  const updateActivity = useCallback(() => {
    const now = Date.now();
    setLastActivity(now);
    localStorage.setItem('admin_last_activity', now.toString());
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, updateActivity));

    return () => {
      events.forEach((event) =>
        window.removeEventListener(event, updateActivity)
      );
    };
  }, [isAuthenticated, updateActivity]);

  const handleLogout = (autoLogout = false) => {
    setIsAuthenticated(false);
    localStorage.removeItem('admin_authenticated');
    localStorage.removeItem('admin_last_activity');
    if (autoLogout) {
      message.warning(i18n.t('adminPage.autoLogoutWarning'));
    }
    const locale = pathname.split('/')[1];
    router.replace(`/${locale}`);
  };

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div>
      {isAuthenticated && (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: spacing.sm,
            }}
          >
            <Button
              icon={<UnorderedListOutlined />}
              onClick={() => setInventurOpen(true)}
            >
              {i18n.t('inventory.inventurQuick')}
            </Button>
            <Button
              icon={<LogoutOutlined />}
              onClick={() => handleLogout(false)}
            >
              {i18n.t('adminPage.logout')}
            </Button>
          </div>
          <InventoryDashboard
            inventurOpen={inventurOpen}
            onInventurClose={() => setInventurOpen(false)}
          />
        </>
      )}
    </div>
  );
}
