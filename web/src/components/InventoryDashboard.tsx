'use client';

import { useState, useEffect, useCallback } from 'react';
import { Table, Button, message, App } from 'antd';
import { UnorderedListOutlined } from '@ant-design/icons';
import AdminSettings from './AdminSettings';
import { i18n } from '@/lib/i18n';
import { sortByPartOrder } from '@/lib/componentOrder';
import { spacing } from '@/styles/spacing';
import { useApi, InventoryItem } from '@/contexts/ApiContext';
import { buildInventurInitialValues } from './inventory/inventoryUtils';
import InventurModal from './inventory/InventurModal';
import { useInventoryTableColumns } from './inventory/inventoryTableColumns';
import InventoryDashboardStyles from './inventory/InventoryDashboardStyles';
import type { InventoryEditValues } from './inventory/types';

interface InventoryDashboardProps {
  inventurOpen?: boolean;
  onInventurClose?: () => void;
}

export default function InventoryDashboard({
  inventurOpen: inventurOpenProp,
  onInventurClose: onInventurCloseProp,
}: InventoryDashboardProps) {
  const { modal } = App.useApp();
  const {
    inventory: apiInventory,
    updateInventoryItem,
    mcConnected,
    componentsConfig,
    forceStartMagazineChange,
    queueStatus,
  } = useApi();
  const [inventory, setInventory] = useState<InventoryItem[]>(apiInventory);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<InventoryEditValues>({
    totalStock: 50,
    currentMagazineStock: 11,
    warningStock: 10,
    magazineCount: 2,
    magazineSize: 11,
    maxOrderQuantity: 2,
  });
  const [messageApi, contextHolder] = message.useMessage();
  const [inventurOpenLocal, setInventurOpenLocal] = useState(false);
  const [inventurLooseValues, setInventurLooseValues] = useState<
    Record<string, number>
  >({});
  const [inventurFullMagazines, setInventurFullMagazines] = useState<
    Record<string, number>
  >({});
  const [inventurSaving, setInventurSaving] = useState(false);

  const isInventurControlled =
    inventurOpenProp !== undefined && onInventurCloseProp;
  const inventurOpen = isInventurControlled
    ? inventurOpenProp
    : inventurOpenLocal;
  const setInventurOpen = isInventurControlled
    ? (open: boolean) => {
        if (!open) onInventurCloseProp?.();
      }
    : setInventurOpenLocal;

  useEffect(() => {
    setInventory(
      sortByPartOrder(apiInventory, componentsConfig?.order ?? undefined)
    );
  }, [apiInventory, componentsConfig?.order]);

  const magazineChangeDisabled = mcConnected === false;
  const blockMagazineForce =
    queueStatus?.activeOrder?.status === 'ORDER_READY';

  const handleEdit = useCallback((record: InventoryItem) => {
    setEditingId(record.componentId);
    setEditValues({
      totalStock: record.totalStock,
      currentMagazineStock: record.currentMagazineStock,
      warningStock: record.warningStock,
      magazineCount: record.magazineCount,
      magazineSize: record.magazineSize,
      maxOrderQuantity: record.maxOrderQuantity,
    });
  }, []);

  const handleSave = useCallback(
    async (componentId: string) => {
      const record = inventory.find((x) => x.componentId === componentId);

      if (
        editValues.maxOrderQuantity < 1 ||
        editValues.maxOrderQuantity > editValues.magazineCount
      ) {
        messageApi.error(
          i18n
            .t('inventory.maxOrderQuantityOutOfRange')
            .replace('{max}', String(editValues.magazineCount))
        );
        return;
      }

      try {
        const newTotal = editValues.totalStock;
        const newMag = editValues.currentMagazineStock;
        const oldMag = record?.currentMagazineStock;

        const shouldConfirm =
          typeof newTotal === 'number' &&
          typeof newMag === 'number' &&
          newTotal >= 0 &&
          newMag >= 0 &&
          newTotal < newMag;

        if (shouldConfirm) {
          const confirmed = await new Promise<boolean>((resolve) => {
            modal.confirm({
              title: 'Lagerbestand unter Magazinfüllstand',
              content: `Du setzt den Gesamtbestand auf ${newTotal}, aber der Magazinfüllstand wäre dann ${newMag}. Das ist inkonsistent. Wenn du fortfährst, wird der Magazinfüllstand automatisch auf ${newTotal} reduziert. Fortfahren?`,
              okText: 'Ja, übernehmen',
              cancelText: 'Abbrechen',
              onOk: () => resolve(true),
              onCancel: () => resolve(false),
            });
          });

          if (!confirmed) return;

          await updateInventoryItem(componentId, {
            ...editValues,
            currentMagazineStock: newTotal,
          });
        } else {
          await updateInventoryItem(componentId, editValues);
        }
        setEditingId(null);
        messageApi.success(i18n.t('inventory.updateSuccess'));
      } catch (error) {
        console.error('Failed to update inventory:', error);
        messageApi.error(i18n.t('inventory.updateError'));
      }
    },
    [editValues, inventory, messageApi, modal, updateInventoryItem]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const openInventur = useCallback(() => {
    setInventurOpenLocal(true);
  }, []);

  useEffect(() => {
    if (!inventurOpen) return;
    const { loose, full } = buildInventurInitialValues(inventory);
    setInventurLooseValues(loose);
    setInventurFullMagazines(full);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-init only when opening, not on inventory refetch
  }, [inventurOpen]);

  const handleInventurSave = useCallback(async () => {
    setInventurSaving(true);
    try {
      await Promise.all(
        inventory.map((item) => {
          const componentId = item.componentId;
          const totalStock =
            (item.currentMagazineStock ?? 0) +
            (inventurLooseValues[componentId] ?? 0) +
            (inventurFullMagazines[componentId] ?? 0) * item.magazineSize;
          return updateInventoryItem(componentId, { totalStock }).catch(() => {
            throw new Error(`Failed to update ${componentId}`);
          });
        })
      );
      messageApi.success(i18n.t('inventory.inventurTotalUpdated'));
      setInventurOpen(false);
    } catch (error) {
      console.error('Inventur save failed:', error);
      messageApi.error(i18n.t('inventory.inventurSaveError'));
    } finally {
      setInventurSaving(false);
    }
  }, [
    inventory,
    inventurLooseValues,
    inventurFullMagazines,
    messageApi,
    updateInventoryItem,
    setInventurOpen,
  ]);

  const handleForceMagazineChange = useCallback(
    async (record: InventoryItem) => {
      if (magazineChangeDisabled || blockMagazineForce) return;
      const partCfg =
        componentsConfig?.parts?.[record.component.type];
      const part = partCfg?.mc?.magazinIndex;
      if (!part) {
        messageApi.error(i18n.t('inventory.forceMagazineChangeFailed'));
        return;
      }
      try {
        await forceStartMagazineChange(part);
        messageApi.success(i18n.t('inventory.forceMagazineChangeSuccess'));
      } catch (error) {
        console.error('Failed to force magazine change:', error);
        messageApi.error(i18n.t('inventory.forceMagazineChangeFailed'));
      }
    },
    [
      magazineChangeDisabled,
      blockMagazineForce,
      componentsConfig,
      forceStartMagazineChange,
      messageApi,
    ]
  );

  const columns = useInventoryTableColumns({
    editingId,
    editValues,
    setEditValues,
    componentsConfig,
    magazineChangeDisabled,
    blockMagazineForce,
    onEdit: handleEdit,
    onSave: handleSave,
    onCancelEdit: handleCancelEdit,
    onForceMagazineChange: handleForceMagazineChange,
  });

  return (
    <div>
      {contextHolder}
      <InventurModal
        open={inventurOpen}
        confirmLoading={inventurSaving}
        inventory={inventory}
        componentsConfig={componentsConfig}
        inventurLooseValues={inventurLooseValues}
        inventurFullMagazines={inventurFullMagazines}
        setInventurLooseValues={setInventurLooseValues}
        setInventurFullMagazines={setInventurFullMagazines}
        onOk={() => void handleInventurSave()}
        onCancel={() => setInventurOpen(false)}
      />
      {!isInventurControlled && (
        <div style={{ marginBottom: spacing.md }}>
          <Button
            icon={<UnorderedListOutlined />}
            onClick={openInventur}
            size="small"
          >
            {i18n.t('inventory.inventurQuick')}
          </Button>
        </div>
      )}
      <div className="admin-inventory-table">
        <Table
          columns={columns}
          dataSource={inventory}
          rowKey="id"
          rowClassName={(record) => {
            const warning = typeof record.warningStock === 'number' ? record.warningStock : 0;
            const criticalThreshold = warning / 2;
            if (record.totalStock <= criticalThreshold) return 'critical-stock-row';
            if (record.totalStock <= warning) return 'low-stock-row';
            return '';
          }}
          pagination={false}
          tableLayout="fixed"
        />
      </div>

      <AdminSettings />

      <InventoryDashboardStyles />
    </div>
  );
}
