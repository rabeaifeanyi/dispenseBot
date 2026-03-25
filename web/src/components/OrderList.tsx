'use client';

import { Card, Tag, List, Empty, Typography, Space } from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { i18n } from '@/lib/i18n';
import { spacing } from '@/styles/spacing';
import { useApi, Order } from '@/contexts/ApiContext';

const { Text, Title } = Typography;

const statusConfig: Record<
  string,
  { color: string; icon: React.ReactNode; label: string }
> = {
  PENDING: {
    color: 'gold',
    icon: <ClockCircleOutlined />,
    label: 'Ausstehend',
  },
  PROCESSING_ORDER: {
    color: 'blue',
    icon: <SyncOutlined />,
    label: 'In Bearbeitung',
  },
  ORDER_READY: {
    color: 'cyan',
    icon: <CheckCircleOutlined />,
    label: 'Bereit zur Abholung',
  },
  PICKED_UP: {
    color: 'green',
    icon: <CheckCircleOutlined />,
    label: 'Abgeholt',
  },
  MAGAZINE_CHANGE_NEEDED: {
    color: 'red',
    icon: <CloseCircleOutlined />,
    label: 'Magazin wechsel erforderlich',
  },
  ABORTED: {
    color: 'red',
    icon: <CloseCircleOutlined />,
    label: 'Abgebrochen',
  },
};

const mockOrders: Order[] = [
  {
    id: 'demo-1',
    timestamp: new Date(Date.now() - 300000).toISOString(),
    status: 'PENDING',
    items: [
      { componentId: 'PART1', quantity: 3 },
      { componentId: 'PART2', quantity: 3 },
      { componentId: 'PART3', quantity: 3 },
      { componentId: 'PART4', quantity: 3 },
      { componentId: 'PART5', quantity: 3 },
    ],
  },
  {
    id: 'demo-2',
    timestamp: new Date(Date.now() - 60000).toISOString(),
    status: 'PENDING',
    items: [
      { componentId: 'PART1', quantity: 2 },
      { componentId: 'PART2', quantity: 2 },
      { componentId: 'PART3', quantity: 2 },
      { componentId: 'PART4', quantity: 2 },
      { componentId: 'PART5', quantity: 2 },
    ],
  },
];

interface OrderListProps {
  demoMode?: boolean;
}

export default function OrderList({ demoMode = false }: OrderListProps) {
  const { orders, componentsConfig } = useApi();
  const displayOrders = demoMode ? mockOrders : orders;

  if (displayOrders.length === 0) {
    return (
      <div style={{ paddingTop: spacing.xl, paddingBottom: spacing.xl }}>
        <Title level={3} style={{ marginBottom: spacing.md }}>
          {i18n.t('orders.title')}
        </Title>
        <Empty description={i18n.t('orders.noOrders')} />
      </div>
    );
  }

  return (
    <>
      <Title level={3} style={{ marginBottom: spacing.md }}>
        {i18n.t('orders.title')}
      </Title>
      <List
      dataSource={displayOrders}
      split={false}
      renderItem={(order) => {
        const status = statusConfig[order.status] || statusConfig.PENDING;
        return (
          <List.Item style={{ padding: 0, marginBottom: spacing.sm }}>
            <Card
              style={{
                width: '100%',
                background: '#fafafa',
                borderRadius: 24,
                border: 'none',
              }}
              styles={{ body: { padding: spacing.sm } }}
              title={
                <Space>
                  {status.icon}
                  <span>{order.id}</span>
                </Space>
              }
              extra={
                <Tag color={status.color} icon={status.icon}>
                  {status.label}
                </Tag>
              }
            >
              <Text type="secondary">
                {new Date(order.timestamp).toLocaleString('de-DE')}
              </Text>

              <div
                style={{
                  marginTop: spacing.xs + 4,
                  marginBottom: spacing.xs / 2,
                }}
              >
                <Text strong>Komponenten:</Text>
              </div>
              <List
                size="small"
                dataSource={order.items || []}
                renderItem={(item) => {
                  const name =
                    componentsConfig?.parts?.[
                      String(
                        item.component?.type ?? (item.componentId as any)
                      ).toUpperCase()
                    ]?.displayName ??
                    String(
                      item.component?.type ?? (item.componentId as any) ?? ''
                    );

                  const isAborted = order.status === 'ABORTED';
                  const dispensed = item.dispensedQuantity ?? 0;
                  const note =
                    isAborted && item.quantity > 0 && dispensed >= item.quantity
                      ? 'wurde ausgegeben'
                      : isAborted && dispensed === 0
                      ? 'nicht ausgegeben'
                      : isAborted && dispensed < item.quantity
                      ? `${dispensed} ausgegeben`
                      : null;

                  const noteColor =
                    isAborted && item.quantity > 0 && dispensed >= item.quantity
                      ? '#389e0d'
                      : '#cf1322';

                  return (
                    <List.Item style={{ paddingLeft: 0, paddingRight: 0 }}>
                      <Text strong>{item.quantity}x</Text> {name}
                      {note && (
                        <Text
                          style={{
                            fontSize: 11,
                            color: noteColor,
                            marginLeft: 6,
                          }}
                        >
                          ({note})
                        </Text>
                      )}
                    </List.Item>
                  );
                }}
              />
            </Card>
          </List.Item>
        );
      }}
    />
    </>
  );
}
