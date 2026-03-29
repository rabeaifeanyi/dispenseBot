'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, Row, Col, Statistic, Alert } from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { sortByPartOrder } from '@/lib/componentOrder';
import { spacing } from '@/styles/spacing';
import { useApi, InventoryItem } from '@/contexts/ApiContext';
import { i18n } from '@/lib/i18n';

type StockStatus = 'good' | 'warning' | 'critical';

export default function StockOverview() {
  const { inventory: apiInventory, componentsConfig } = useApi();
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const imagesReady = !!componentsConfig;
  const inventory = useMemo(
    () => sortByPartOrder(apiInventory, componentsConfig?.order ?? undefined),
    [apiInventory, componentsConfig?.order]
  );

  const getStockStatus = (item: InventoryItem): StockStatus => {
    if (item.totalStock <= item.warningStock / 2) return 'critical';
    if (item.totalStock <= item.warningStock) return 'warning';
    return 'good';
  };

  const getStatusColor = (status: StockStatus): string => {
    switch (status) {
      case 'good':
        return '#8c8c8c';
      case 'warning':
        return '#faad14';
      case 'critical':
        return '#ff4d4f';
      default:
        return '#8c8c8c';
    }
  };

  const getStatusIcon = (status: StockStatus) => {
    switch (status) {
      case 'good':
        return <CheckCircleOutlined />;
      case 'warning':
        return <WarningOutlined />;
      case 'critical':
        return <CloseCircleOutlined />;
      default:
        return <CheckCircleOutlined />;
    }
  };

  const handleImageError = (componentType: string) => {
    setFailedImages((prev) => new Set([...prev, componentType]));
  };
  const handleImageLoad = (componentType: string) => {
    setFailedImages((prev) => {
      if (!prev.has(componentType)) return prev;
      const next = new Set(prev);
      next.delete(componentType);
      return next;
    });
  };

  const partsImagesFileBaseFingerprint = useMemo(() => {
    if (!componentsConfig) return '';
    return Object.keys(componentsConfig.parts)
      .map((p) => componentsConfig.parts[p]?.images?.fileBase ?? '')
      .join('|');
  }, [componentsConfig]);

  useEffect(() => {
    if (!componentsConfig) return;
    setFailedImages(new Set());
  }, [partsImagesFileBaseFingerprint]);

  const getComponentImageSrc = (componentType: string) => {
    if (!componentsConfig) return '';
    const base =
      componentsConfig.parts[componentType.toUpperCase()].images.fileBase;
    // Breite Kacheln: `l_*.JPG` (fileBase wie in config, z. B. "druecker").
    const dotIdx = base.lastIndexOf('.');
    const fileBaseNoExt = dotIdx > 0 ? base.slice(0, dotIdx) : base;
    const wideBase = fileBaseNoExt.startsWith('l_')
      ? fileBaseNoExt
      : `l_${fileBaseNoExt}`;
    return `/images/components/${wideBase}.JPG`;
  };

  const criticalItems = inventory.filter(
    (item) => getStockStatus(item) === 'critical'
  );
  const warningItems = inventory.filter(
    (item) => getStockStatus(item) === 'warning'
  );

  return (
    <div>
      {criticalItems.length > 0 && (
        <Alert
          message={i18n.t('stock.critical')}
          description={
            <ul style={{ marginBottom: 0 }}>
              {criticalItems.map((item) => (
                <li key={item.id}>
                  {componentsConfig?.parts?.[item.component.type.toUpperCase()]
                    ?.displayName ?? item.component.type}
                </li>
              ))}
            </ul>
          }
          type="error"
          showIcon
          style={{ marginBottom: spacing.md }}
        />
      )}

      {warningItems.length > 0 && (
        <Alert
          message={i18n.t('stock.low')}
          description={
            <ul style={{ marginBottom: 0 }}>
              {warningItems.map((item) => (
                <li key={item.id}>
                  {componentsConfig?.parts?.[item.component.type.toUpperCase()]
                    ?.displayName ?? item.component.type}
                </li>
              ))}
            </ul>
          }
          type="warning"
          showIcon
          style={{ marginBottom: spacing.md }}
        />
      )}

      <Row gutter={[spacing.sm, spacing.sm]}>
        {inventory.map((item) => {
          const status = getStockStatus(item);
          const statusColor = getStatusColor(status);
          const coverBg =
            status === 'critical'
              ? '#ffccc7'
              : status === 'warning'
              ? '#fff1b8'
              : '#e6e6e6';
          const maxCapacity = item.magazineCount * item.magazineSize;
          const percentage = ((item.totalStock / maxCapacity) * 100).toFixed(0);

          return (
            <Col xs={24} sm={12} md={8} lg={8} key={item.id}>
              <Card
                style={{ border: 'none', background: '#fafafa' }}
                cover={
                  <div
                    style={{
                      height: '112px',
                      background: coverBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {imagesReady && !failedImages.has(item.component.type) && (
                      <div
                        className={`component-image-wrap component-image-wrap-${item.component.type.toLowerCase()}`}
                        style={{
                          width: '100%',
                          height: '100%',
                        }}
                      >
                        <img
                          className="component-image"
                          src={getComponentImageSrc(item.component.type)}
                          alt={
                            componentsConfig?.parts?.[
                              item.component.type.toUpperCase()
                            ]?.displayName ?? item.component.type
                          }
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            objectPosition: 'center top',
                          }}
                          onError={() => handleImageError(item.component.type)}
                          onLoad={() => handleImageLoad(item.component.type)}
                        />
                        <div
                          className="component-image-tint"
                          aria-hidden="true"
                          style={{
                            background:
                              componentsConfig?.parts?.[
                                item.component.type.toUpperCase()
                              ]?.tint.overlay ?? undefined,
                            opacity:
                              componentsConfig?.parts?.[
                                item.component.type.toUpperCase()
                              ]?.tint.overlay?.toUpperCase() === '#FFFFFF'
                                ? 0
                                : 0.55,
                          }}
                        />
                      </div>
                    )}
                  </div>
                }
              >
                <div
                  style={{
                    fontWeight: 'bold',
                    fontSize: '16px',
                    marginBottom: spacing.xs + 4,
                  }}
                >
                  {componentsConfig?.parts?.[item.component.type.toUpperCase()]
                    ?.displayName ?? item.component.type}
                </div>
                <Statistic
                  value={item.totalStock}
                  prefix={getStatusIcon(status)}
                  valueStyle={{ color: statusColor, fontSize: '20px' }}
                />
                <div
                  style={{
                    marginTop: spacing.xs,
                    fontSize: '12px',
                    color: '#8c8c8c',
                  }}
                >
                  {i18n
                    .t('stock.magazinesSummary')
                    .replace('{count}', String(item.magazineCount))
                    .replace('{size}', String(item.magazineSize))}
                </div>
                <div
                  style={{
                    marginTop: spacing.xs / 2,
                    height: '4px',
                    background: '#f0f0f0',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${percentage}%`,
                      background: statusColor,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>
    </div>
  );
}
