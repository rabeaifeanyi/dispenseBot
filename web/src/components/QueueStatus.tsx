'use client';

import { useState } from 'react';
import {
  Card,
  Statistic,
  Spin,
  Empty,
  Button,
  message,
  Popconfirm,
} from 'antd';
import { ClockCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { sortOrderItemsByPart } from '@/lib/componentOrder';
import { spacing } from '@/styles/spacing';
import { useApi } from '@/contexts/ApiContext';

interface QueuedOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalItems: number;
  magazineChangeNeeded?: boolean;
  items: Array<{
    id: string;
    componentId: string;
    quantity: number;
    component: {
      id: string;
      type: string;
      name: string;
    };
  }>;
}

interface QueueStatusResponse {
  isAutomatBusy: boolean;
  queueLength: number;
  activeOrder: QueuedOrder | null;
  queuedOrders: QueuedOrder[];
}

export default function QueueStatus() {
  const { queueStatus, cancelOrder, componentsConfig } = useApi();
  const [canceling, setCanceling] = useState<string | null>(null);

  const handleCancel = async (orderId: string) => {
    try {
      setCanceling(orderId);
      await cancelOrder(orderId);
      message.success('Bestellung storniert');
    } catch (error) {
      console.error('Error canceling order:', error);
      message.error('Fehler beim Stornieren der Bestellung');
    } finally {
      setCanceling(null);
    }
  };

  if (!queueStatus) {
    return (
      <div style={{ textAlign: 'center', padding: spacing.sm }}>
        <Spin size="small" />
      </div>
    );
  }

  const { isAutomatBusy, queueLength, activeOrder, queuedOrders } = queueStatus;
  if (queueLength === 0) return null;

  return (
    <div style={{ marginBottom: spacing.md }}>
      <Card style={{ marginTop: spacing.sm, marginBottom: spacing.md }}>
        <div style={{ marginBottom: spacing.sm }}>
          <h3 style={{ margin: `0 0 ${spacing.sm}px 0` }}>Warteschlange</h3>
          {isAutomatBusy && activeOrder && (
            <div
              style={{
                padding: spacing.xs + 4,
                border: '1px solid #1890ff',
                borderRadius: 4,
                backgroundColor: '#e6f7ff',
                marginBottom: spacing.sm,
              }}
            >
              <div style={{ fontWeight: 500, marginBottom: spacing.xs / 2 }}>
                Aktive Bestellung: {activeOrder.orderNumber}
                {activeOrder.status === 'ORDER_READY' && (
                  <span style={{ marginLeft: spacing.xs, color: '#52c41a' }}>
                    (Abholbereit)
                  </span>
                )}
                {activeOrder.status === 'PROCESSING_ORDER' && (
                  <span style={{ marginLeft: spacing.xs, color: '#1890ff' }}>
                    (Wird bearbeitet)
                  </span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
                {activeOrder.totalItems} Komponenten
                {Array.isArray(activeOrder.items) &&
                  activeOrder.items.length > 0 && (
                    <>
                      {' - '}
                      {sortOrderItemsByPart(
                        activeOrder.items,
                        componentsConfig?.order ?? undefined
                      )
                        .map(
                          (item) =>
                            `${item.quantity}x ${
                              componentsConfig?.parts?.[
                                (
                                  item.component?.type ?? ('' as any)
                                ).toUpperCase()
                              ]?.displayName ??
                              String(item.component?.type ?? '')
                            }`
                        )
                        .join(', ')}
                    </>
                  )}
              </div>
            </div>
          )}
          {queueLength > 0 && (
            <Statistic
              title="Bestellungen in der Warteschlange"
              value={queueLength}
              prefix={<ClockCircleOutlined />}
            />
          )}
        </div>

        {queuedOrders && queuedOrders.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: spacing.xs + 4,
            }}
          >
            {queuedOrders.map((order, index) => (
              <div
                key={order.id}
                style={{
                  padding: spacing.xs + 4,
                  border: '1px solid #f0f0f0',
                  borderRadius: 4,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>
                    #{index + 1}: {order.orderNumber}
                  </div>
                  <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
                    {order.totalItems} Komponenten
                    {Array.isArray(order.items) && order.items.length > 0 && (
                      <>
                        {' - '}
                        {sortOrderItemsByPart(
                          order.items,
                          componentsConfig?.order ?? undefined
                        )
                          .map(
                            (item) =>
                              `${item.quantity}x ${
                                componentsConfig?.parts?.[
                                  (
                                    item.component?.type ?? ('' as any)
                                  ).toUpperCase()
                                ]?.displayName ??
                                String(item.component?.type ?? '')
                              }`
                          )
                          .join(', ')}
                      </>
                    )}
                  </div>
                </div>
                <Popconfirm
                  title="Bestellung stornieren?"
                  description="Diese Aktion kann nicht rückgängig gemacht werden."
                  onConfirm={() => handleCancel(order.id)}
                  okText="Ja, stornieren"
                  cancelText="Abbrechen"
                >
                  <Button
                    type="primary"
                    danger
                    icon={<DeleteOutlined />}
                    size="small"
                    loading={canceling === order.id}
                    style={{ marginLeft: spacing.xs + 4 }}
                  >
                    Stornieren
                  </Button>
                </Popconfirm>
              </div>
            ))}
          </div>
        ) : (
          queueLength === 0 && (
            <Empty description="Keine Bestellungen in der Warteschlange" />
          )
        )}
      </Card>
    </div>
  );
}
