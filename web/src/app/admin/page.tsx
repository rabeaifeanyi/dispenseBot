'use client';

import { useState, useEffect, useCallback } from 'react';
import InventoryDashboard from '@/components/InventoryDashboard';
import { Button, message } from 'antd';
import { LogoutOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { spacing } from '@/styles/spacing';

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes

export default function AdminPage() {
  const router = useRouter();
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
        message.warning(
          'Du wurdest nach 15 Minuten Inaktivität automatisch abgemeldet'
        );
        router.replace('/');
        return;
      }
    } else {
      router.replace('/');
      return;
    }
    setIsLoading(false);
  }, [router]);

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
      message.warning('Automatisch abgemeldet nach 15 Minuten Inaktivität');
    }
    router.replace('/');
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
              Schnell-Inventur
            </Button>
            <Button
              icon={<LogoutOutlined />}
              onClick={() => handleLogout(false)}
            >
              Abmelden
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
