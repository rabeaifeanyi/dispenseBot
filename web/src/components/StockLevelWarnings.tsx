'use client';

import { Alert } from 'antd';
import { spacing } from '@/styles/spacing';
import { i18n } from '@/lib/i18n';
import type { ComponentsConfig, InventoryItem } from '@/contexts/ApiContext';
import { getStockLevelStatus } from '@/lib/stockLevelStatus';

type Props = {
  inventory: InventoryItem[];
  componentsConfig: ComponentsConfig | null;
};

export default function StockLevelWarnings({
  inventory,
  componentsConfig,
}: Props) {
  const criticalItems = inventory.filter(
    (item) => getStockLevelStatus(item) === 'critical'
  );
  const warningItems = inventory.filter(
    (item) => getStockLevelStatus(item) === 'warning'
  );

  return (
    <>
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
    </>
  );
}
