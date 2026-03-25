'use client';

import { useState, useMemo } from 'react';
import {
  Form,
  InputNumber,
  Button,
  Card,
  Table,
  message,
  Space,
  Modal,
} from 'antd';
import { ShoppingCartOutlined } from '@ant-design/icons';
import { i18n } from '@/lib/i18n';
import {
  DEFAULT_COMPONENT_ORDER,
  sortByComponentTypeOrder,
} from '@/lib/componentOrder';
import {
  inventoryItemToOrderFormRow,
  type OrderFormInventoryRow,
} from '@/lib/orderFormUtils';
import { spacing } from '@/styles/spacing';
import { useApi } from '@/contexts/ApiContext';
import { useDemo, DEMO_MAGAZINE_SIZE } from '@/contexts/DemoContext';
import { getMagazineLabelColor } from '@/components/inventory/magazineLabelColor';

type PartType = (typeof DEFAULT_COMPONENT_ORDER)[number];

type OrderItem = { componentType: PartType; quantity: number };

interface OrderFormProps {
  onSuccess?: () => void;
  demoMode?: boolean;
}

export default function OrderForm({
  onSuccess,
  demoMode = false,
}: OrderFormProps = {}) {
  const {
    inventory: apiInventory,
    submitOrder: submitOrderAction,
    componentsConfig,
  } = useApi();
  const { mockInventory: demoInventory } = useDemo();

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [penCount, setPenCount] = useState<number>(0);
  const [messageApi, contextHolder] = message.useMessage();

  const [magazineChangePromptOpen, setMagazineChangePromptOpen] =
    useState(false);
  const [pendingItems, setPendingItems] = useState<OrderItem[] | null>(null);
  const [magazineChangeComponentType, setMagazineChangeComponentType] =
    useState<PartType | null>(null);

  const inventory = useMemo(() => {
    const order = componentsConfig?.order;
    const rows = demoMode
      ? demoInventory.map(inventoryItemToOrderFormRow)
      : apiInventory.map(inventoryItemToOrderFormRow);
    return sortByComponentTypeOrder(rows, order);
  }, [demoMode, demoInventory, apiInventory, componentsConfig?.order]);

  const getMagazineLabelColorForPart = (type: PartType): string =>
    getMagazineLabelColor(type, componentsConfig);

  const getMagazineChangeCandidates = (items: OrderItem[]) =>
    items.filter((item) => {
      const row = inventory.find((i) => i.type === item.componentType);
      if (!row) return false;
      return item.quantity > row.currentMagazineStock;
    });

  const handleSubmit = async (values: Record<string, unknown>) => {
    const items = Object.entries(values)
      .filter(([_, qty]) => typeof qty === 'number' && qty > 0)
      .map(([type, quantity]) => ({
        componentType: type as PartType,
        quantity: quantity as number,
      })) as OrderItem[];

    if (items.length === 0) {
      messageApi.warning(i18n.t('orderForm.selectAtLeastOne'));
      return;
    }

    const candidates = getMagazineChangeCandidates(items);
    if (candidates.length > 0) {
      const first = candidates[0];
      setMagazineChangeComponentType(first.componentType);
      setPendingItems(items);
      setMagazineChangePromptOpen(true);
      return;
    }

    submitOrder(items);
  };

  const submitOrder = async (items: OrderItem[]) => {
    setLoading(true);

    if (demoMode) {
      setTimeout(() => {
        messageApi.success(i18n.t('orderForm.successDemo'));
        form.resetFields();
        setPenCount(0);
        setLoading(false);
        onSuccess?.();
      }, 1000);
      return;
    }

    try {
      await submitOrderAction(
        items.map((item) => ({
          componentType: item.componentType,
          quantity: item.quantity,
        }))
      );
      messageApi.success(i18n.t('orderForm.success'));
      form.resetFields();
      setPenCount(0);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to submit order:', error);
      const msg =
        error instanceof Error && error.message
          ? error.message
          : i18n.t('orderForm.error');
      messageApi.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const getAvailableStock = (type: PartType) => {
    const row = inventory.find((i) => i.type === type);
    if (!row) return 0;
    const magazineBased =
      (row.maxOrderQuantity - 1) * row.magazineSize + row.currentMagazineStock;
    return row.totalStock !== undefined
      ? Math.min(magazineBased, row.totalStock)
      : magazineBased;
  };

  const handlePenCountChange = (count: number | null) => {
    const value = count || 0;
    setPenCount(value);
    const values: Record<string, number> = {};
    DEFAULT_COMPONENT_ORDER.forEach((type) => {
      values[type] = value;
    });
    form.setFieldsValue(values);
  };

  const getMaxPens = () => {
    if (inventory.length === 0) return 0;
    const maxForEachComponent = inventory.map((item) =>
      getAvailableStock(item.type as PartType)
    );
    return Math.min(...maxForEachComponent);
  };

  const tableData: OrderFormInventoryRow[] = useMemo(() => {
    if (inventory.length > 0) return inventory;
    return DEFAULT_COMPONENT_ORDER.map((type) => ({
      type,
      name: componentsConfig?.parts?.[type]?.displayName ?? type,
      currentMagazineStock: 0,
      magazineSize: DEMO_MAGAZINE_SIZE,
      maxOrderQuantity: 0,
    }));
  }, [inventory, componentsConfig?.parts]);

  const columns = [
    {
      title: i18n.t('inventory.component'),
      key: 'component',
      width: '45%',
      render: (_: unknown, record: OrderFormInventoryRow) => (
        <span style={{ fontStyle: 'italic', fontWeight: 600 }}>
          {componentsConfig?.parts?.[record.type]?.displayName ?? record.type}
        </span>
      ),
    },
    {
      title: i18n.t('orderForm.available'),
      key: 'available',
      width: '25%',
      render: (_: unknown, record: OrderFormInventoryRow) => {
        const available = getAvailableStock(record.type as PartType);
        const row = inventory.find((i) => i.type === record.type);
        const inMag = row?.currentMagazineStock ?? 0;
        return (
          <div style={{ fontSize: 12 }}>
            <span style={{ color: available < 10 ? '#cf1322' : undefined }}>
              {available} {i18n.t('orderForm.piecesUnit')}
            </span>
            <div style={{ fontSize: 11, color: '#999' }}>
              {i18n.t('orderForm.inMagazine').replace('{count}', String(inMag))}
            </div>
          </div>
        );
      },
    },
    {
      title: i18n.t('orderForm.quantity'),
      key: 'quantity',
      width: '30%',
      render: (_: unknown, record: OrderFormInventoryRow) => {
        const available = getAvailableStock(record.type as PartType);
        return (
          <Form.Item
            name={record.type}
            initialValue={0}
            style={{ marginBottom: 0 }}
          >
            <InputNumber
              min={0}
              max={available}
              style={{ width: '100%', maxWidth: 120 }}
              placeholder="0"
              size="small"
            />
          </Form.Item>
        );
      },
    },
  ];

  return (
    <>
      {contextHolder}

      <Card style={{ background: '#fafafa', marginBottom: spacing.sm }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: spacing.sm,
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontWeight: 600 }}>
            {i18n.t('orderForm.completePens')}
          </div>
          <Space>
            <InputNumber
              min={0}
              max={getMaxPens()}
              value={penCount}
              onChange={handlePenCountChange}
              placeholder={i18n.t('orderForm.quantityPlaceholder')}
              size="small"
              style={{ width: 120 }}
            />
            <Button
              size="small"
              onClick={() => handlePenCountChange(0)}
              disabled={penCount === 0}
            >
              {i18n.t('common.reset')}
            </Button>
            {getMaxPens() > 0 && (
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                {i18n
                  .t('orderForm.maxAvailableShort')
                  .replace('{max}', String(getMaxPens()))}
              </span>
            )}
          </Space>
        </div>
      </Card>

      <Form
        form={form}
        onFinish={handleSubmit}
        layout="vertical"
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.preventDefault();
        }}
      >
        <div className="order-form-table">
          <Table
            dataSource={tableData}
            columns={columns}
            rowKey="type"
            pagination={false}
            tableLayout="fixed"
            size="small"
          />
        </div>

        <Form.Item style={{ marginTop: spacing.md }}>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              icon={<ShoppingCartOutlined />}
            >
              {i18n.t('orderForm.submitButton')}
            </Button>
            <Button htmlType="reset" onClick={() => form.resetFields()}>
              {i18n.t('common.reset')}
            </Button>
          </Space>
        </Form.Item>
      </Form>

      <Modal
        title={i18n.t('orderForm.magazineChangeModalTitle')}
        open={magazineChangePromptOpen}
        onOk={() => {
          if (pendingItems) submitOrder(pendingItems);
          setMagazineChangePromptOpen(false);
          setPendingItems(null);
          setMagazineChangeComponentType(null);
        }}
        onCancel={() => {
          setMagazineChangePromptOpen(false);
          setPendingItems(null);
          setMagazineChangeComponentType(null);
        }}
        okText={i18n.t('orderForm.magazineChangeConfirmOrder')}
        cancelText={i18n.t('common.cancel')}
        destroyOnHidden
      >
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
          {i18n.t('orderForm.magazineChangeIntro')}
        </div>
        {magazineChangeComponentType && (
          <div style={{ fontSize: 12 }}>
            {i18n.t('orderForm.affectedPartLabel')}{' '}
            <b>
              {componentsConfig?.parts?.[magazineChangeComponentType]
                ?.displayName ?? magazineChangeComponentType}
            </b>
            {componentsConfig?.parts?.[magazineChangeComponentType]
              ?.magazineLabel && (
              <>
                {' '}
                <span
                  style={{
                    color: getMagazineLabelColorForPart(
                      magazineChangeComponentType
                    ),
                  }}
                >
                  (
                  {
                    componentsConfig.parts[magazineChangeComponentType]
                      .magazineLabel
                  }
                  )
                </span>
              </>
            )}
          </div>
        )}
      </Modal>

      <style jsx>{`
        :global(.order-form-table) {
          font-size: 12px;
        }
        :global(.order-form-table .ant-table-thead > tr > th) {
          font-size: 12px;
          font-weight: 600;
          padding: 8px;
        }
        :global(.order-form-table .ant-table-tbody > tr > td) {
          padding: 8px;
          vertical-align: middle;
        }
      `}</style>
    </>
  );
}
