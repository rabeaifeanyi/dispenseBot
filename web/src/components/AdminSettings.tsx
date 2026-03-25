'use client';

import { useState, useEffect } from 'react';
import { Card, Switch, Row, Col, message } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { spacing } from '@/styles/spacing';

const SETTINGS_KEY = 'admin_settings';

interface AdminSettingsData {
  showMagazineChangeButton: boolean;
}

const DEFAULT_SETTINGS: AdminSettingsData = {
  showMagazineChangeButton: true,
};

export default function AdminSettings() {
  const [settings, setSettings] = useState<AdminSettingsData>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    }
    setLoading(false);
  }, []);

  const handleSettingChange = (
    key: keyof AdminSettingsData,
    value: boolean
  ) => {
    const newSettings = {
      ...settings,
      [key]: value,
    };
    setSettings(newSettings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    message.success('Einstellung gespeichert');
  };

  if (loading) {
    return null;
  }

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
          <SettingOutlined />
          <span>Einstellungen</span>
        </div>
      }
      style={{ marginTop: spacing.md }}
    >
      <Row gutter={[spacing.md, spacing.md]}>
        <Col xs={24}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 500, marginBottom: spacing.xs / 2 }}>
                Magazinwechsel-Button auf Bestellseite
              </div>
              <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
                Zeigt den Magazinwechsel-Button auf der Bestellseite an
              </div>
            </div>
            <Switch
              checked={settings.showMagazineChangeButton}
              onChange={(value) =>
                handleSettingChange('showMagazineChangeButton', value)
              }
            />
          </div>
        </Col>
      </Row>
    </Card>
  );
}
