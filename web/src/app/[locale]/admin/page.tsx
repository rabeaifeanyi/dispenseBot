'use client';

import { useState, useEffect, useCallback } from 'react';
import InventoryDashboard from '@/components/InventoryDashboard';
import MagazineChangeFlowModals from '@/components/magazine/MagazineChangeFlowModals';
import { Alert, Button, message } from 'antd';
import { LogoutOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useRouter, usePathname } from 'next/navigation';
import { spacing } from '@/styles/spacing';
import { i18n } from '@/lib/i18n';
import { useDemo } from '@/contexts/DemoContext';
import { useApi } from '@/contexts/ApiContext';

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes

export default function AdminPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isDemo, mcConnected: demoMcConnected } = useDemo();
  const {
    queueStatus,
    mcConnected: apiMcConnected,
    mcStatusData,
    cancelOrder,
    magazineReset,
    standaloneMagazineChange,
    startMagazineChange,
    componentsConfig,
  } = useApi();
  const [loadingStandaloneMagChange, setLoadingStandaloneMagChange] =
    useState(false);
  const [loadingStartMagChange, setLoadingStartMagChange] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(() => isDemo);
  const [isLoading, setIsLoading] = useState(() => !isDemo);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [inventurOpen, setInventurOpen] = useState(false);

  const activeOrder = queueStatus?.activeOrder ?? null;
  const currentOrder = isDemo
    ? null
    : activeOrder &&
      (activeOrder.status === 'ORDER_READY' ||
        activeOrder.status === 'PROCESSING_ORDER' ||
        activeOrder.status === 'MAGAZINE_CHANGE_NEEDED')
    ? activeOrder
    : null;

  const actualMcConnected = isDemo ? demoMcConnected : apiMcConnected;
  const effectiveMcStatusData = isDemo ? null : mcStatusData;

  const handleMcStartMagazineChange = async () => {
    if (isDemo) return;
    setLoadingStartMagChange(true);
    try {
      await startMagazineChange();
    } catch (e) {
      console.error('Start magazine change failed:', e);
      message.error(i18n.t('home.magazineChangeStartFailed'));
    } finally {
      setLoadingStartMagChange(false);
    }
  };

  const handleStandaloneMagazineConfirm = async () => {
    setLoadingStandaloneMagChange(true);
    try {
      await standaloneMagazineChange();
    } catch (e) {
      console.error('Standalone magazine change failed:', e);
      message.error(i18n.t('home.standaloneMagazineChangeFailed'));
    } finally {
      setLoadingStandaloneMagChange(false);
    }
  };

  useEffect(() => {
    if (isDemo) {
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }

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
    if (!isAuthenticated || isDemo) return;

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
    if (!isAuthenticated || isDemo) return;

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
      {isDemo && (
        <Alert
          message={i18n.t('home.demoAlertTitle')}
          description={i18n.t('adminPage.demoAlertDescription')}
          type="info"
          showIcon
          style={{ marginBottom: spacing.md }}
        />
      )}
      {isAuthenticated && (
        <>
          <MagazineChangeFlowModals
            isDemo={isDemo}
            activeOrder={activeOrder}
            currentOrder={currentOrder}
            setDemoCurrentOrder={() => {}}
            queueStatus={queueStatus}
            componentsConfig={componentsConfig}
            effectiveMcStatusData={effectiveMcStatusData}
            actualMcConnected={actualMcConnected !== false}
            loadingStandaloneMagChange={loadingStandaloneMagChange}
            loadingStartMagChange={loadingStartMagChange}
            cancelOrder={cancelOrder}
            magazineReset={magazineReset}
            onMcStartMagazineChange={handleMcStartMagazineChange}
            onStandaloneMagazineConfirm={handleStandaloneMagazineConfirm}
          />
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
