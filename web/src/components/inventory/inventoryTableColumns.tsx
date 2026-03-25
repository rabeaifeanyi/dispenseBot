'use client';

import { useMemo } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Button, InputNumber, Popconfirm, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { i18n } from '@/lib/i18n';
import type { ComponentsConfig, InventoryItem } from '@/contexts/ApiContext';
import type { InventoryEditValues } from './types';

const cellMain = { minHeight: 22, lineHeight: '22px', fontSize: 12 };
const cellSub = { fontSize: 10, color: '#666', marginTop: 2 };

function ThLabel({ children }: { children: ReactNode }) {
  return <span className="inventory-table-th-label">{children}</span>;
}

interface UseInventoryTableColumnsParams {
  editingId: string | null;
  editValues: InventoryEditValues;
  setEditValues: Dispatch<SetStateAction<InventoryEditValues>>;
  componentsConfig: ComponentsConfig | null;
  magazineChangeDisabled: boolean;
  onEdit: (record: InventoryItem) => void;
  onSave: (componentId: string) => void | Promise<void>;
  onCancelEdit: () => void;
  onOpenMagazineChange: (record: InventoryItem) => void;
  onForceMagazineChange: (record: InventoryItem) => void;
}

export function useInventoryTableColumns({
  editingId,
  editValues,
  setEditValues,
  componentsConfig,
  magazineChangeDisabled,
  onEdit,
  onSave,
  onCancelEdit,
  onOpenMagazineChange,
  onForceMagazineChange,
}: UseInventoryTableColumnsParams): ColumnsType<InventoryItem> {
  return useMemo(
    () => [
      {
        title: <ThLabel>{i18n.t('inventory.component')}</ThLabel>,
        dataIndex: ['component', 'name'],
        key: 'name',
        width: '18%',
        minWidth: 148,
        render: (_: string, record: InventoryItem) => (
          <div>
            <div style={{ ...cellMain, fontWeight: 600, fontStyle: 'italic' }}>
              {componentsConfig?.parts?.[record.component.type]?.displayName ??
                record.component.type}
            </div>
          </div>
        ),
      },
      {
        title: (
          <Tooltip title={i18n.t('inventory.activeMagazineTooltip')}>
            <span style={{ cursor: 'help' }}>
              <ThLabel>{i18n.t('inventory.activeMagazineLabel')}</ThLabel>
            </span>
          </Tooltip>
        ),
        dataIndex: 'currentMagazineStock',
        key: 'currentMagazineStock',
        width: '16%',
        render: (value: number, record: InventoryItem) => {
          const isLow = value <= record.magazineSize * 0.3;
          if (editingId === record.componentId) {
            return (
              <div style={cellMain}>
                <InputNumber
                  size="small"
                  min={0}
                  value={editValues.currentMagazineStock}
                  onChange={(val) =>
                    setEditValues((prev) => ({
                      ...prev,
                      currentMagazineStock: val || 0,
                    }))
                  }
                  style={{ width: 72 }}
                />
              </div>
            );
          }
          return (
            <div>
              <div
                style={{
                  ...cellMain,
                  color: isLow ? '#fa8c16' : undefined,
                  fontWeight: isLow ? 600 : 400,
                }}
              >
                {value} / {record.magazineSize}{' '}
                {i18n.t('inventory.inventurPieces')}
              </div>
            </div>
          );
        },
      },
      {
        title: (
          <Tooltip title={i18n.t('inventory.totalStockTooltip')}>
            <span style={{ cursor: 'help' }}>
              <ThLabel>{i18n.t('inventory.totalStockLabel')}</ThLabel>
            </span>
          </Tooltip>
        ),
        dataIndex: 'totalStock',
        key: 'totalStock',
        width: '16%',
        render: (value: number, record: InventoryItem) => {
          if (editingId === record.componentId) {
            return (
              <div style={cellMain}>
                <InputNumber
                  size="small"
                  min={0}
                  value={editValues.totalStock}
                  onChange={(val) =>
                    setEditValues((prev) => ({
                      ...prev,
                      totalStock: val || 0,
                    }))
                  }
                  style={{ width: 72 }}
                />
              </div>
            );
          }
          const isLow = value <= record.warningStock;
          return (
            <div>
              <div
                style={{
                  ...cellMain,
                  fontWeight: isLow ? 600 : 400,
                  color: isLow ? '#fa8c16' : undefined,
                }}
              >
                {value} {i18n.t('inventory.inventurPieces')}
              </div>
            </div>
          );
        },
      },
      {
        title: (
          <Tooltip title={i18n.t('inventory.warningStockTooltip')}>
            <span style={{ cursor: 'help' }}>
              <ThLabel>{i18n.t('inventory.warningStockLabel')}</ThLabel>
            </span>
          </Tooltip>
        ),
        dataIndex: 'warningStock',
        key: 'warningStock',
        width: '16%',
        render: (value: number, record: InventoryItem) => {
          if (editingId === record.componentId) {
            return (
              <div style={cellMain}>
                <InputNumber
                  size="small"
                  min={0}
                  value={editValues.warningStock}
                  onChange={(val) =>
                    setEditValues((prev) => ({
                      ...prev,
                      warningStock: val || 10,
                    }))
                  }
                  style={{ width: 72 }}
                />
              </div>
            );
          }
          return (
            <div style={cellMain}>
              {value} {i18n.t('inventory.inventurPieces')}
            </div>
          );
        },
      },
      {
        title: (
          <Tooltip title={i18n.t('inventory.magazineTooltip')}>
            <span style={{ cursor: 'help' }}>
              <ThLabel>{i18n.t('inventory.magazineLabel')}</ThLabel>
            </span>
          </Tooltip>
        ),
        dataIndex: 'magazineCount',
        key: 'magazine',
        width: '17%',
        render: (_value: number, record: InventoryItem) => {
          if (editingId === record.componentId) {
            return (
              <div
                style={{
                  ...cellMain,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <InputNumber
                  size="small"
                  min={1}
                  max={100}
                  value={editValues.magazineCount}
                  onChange={(val) =>
                    setEditValues((prev) => ({
                      ...prev,
                      magazineCount: val || 2,
                    }))
                  }
                  style={{ width: 52 }}
                />
                <span style={{ fontSize: 11, color: '#999' }}>×</span>
                <InputNumber
                  size="small"
                  min={1}
                  max={1000}
                  value={editValues.magazineSize}
                  onChange={(val) =>
                    setEditValues((prev) => ({
                      ...prev,
                      magazineSize: val || 11,
                    }))
                  }
                  style={{ width: 52 }}
                />
              </div>
            );
          }
          return (
            <div>
              <div style={cellMain}>
                {record.magazineCount} {i18n.t('inventory.magazineUnit')}
              </div>
              <div style={cellSub}>
                {i18n
                  .t('inventory.perMagazine')
                  .replace('{size}', String(record.magazineSize))}
              </div>
            </div>
          );
        },
      },
      {
        title: (
          <Tooltip title={i18n.t('inventory.maxOrderTooltip')}>
            <span style={{ cursor: 'help' }}>
              <ThLabel>{i18n.t('inventory.maxOrderLabel')}</ThLabel>
            </span>
          </Tooltip>
        ),
        dataIndex: 'maxOrderQuantity',
        key: 'maxOrderQuantity',
        width: '17%',
        render: (value: number, record: InventoryItem) => {
          if (editingId === record.componentId) {
            return (
              <div style={cellMain}>
                <InputNumber
                  size="small"
                  min={1}
                  max={editValues.magazineCount}
                  value={editValues.maxOrderQuantity}
                  onChange={(val) =>
                    setEditValues((prev) => ({
                      ...prev,
                      maxOrderQuantity: val || 1,
                    }))
                  }
                  style={{ width: 52 }}
                />
              </div>
            );
          }
          return (
            <div style={cellMain}>
              {value} {i18n.t('inventory.magazineUnit')}
            </div>
          );
        },
      },
      {
        title: '',
        key: 'actions',
        width: 208,
        align: 'right',
        className: 'admin-table-actions-col',
        render: (_: unknown, record: InventoryItem) => {
          if (editingId === record.componentId) {
            return (
              <div
                className="admin-table-actions admin-table-actions-edit"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 6,
                  ...cellMain,
                }}
              >
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={() => void onSave(record.componentId)}
                  size="small"
                  className="admin-table-action-btn"
                >
                  {i18n.t('inventory.save')}
                </Button>
                <Button
                  icon={<CloseOutlined />}
                  onClick={onCancelEdit}
                  size="small"
                  className="admin-table-action-btn"
                >
                  {i18n.t('common.cancel')}
                </Button>
              </div>
            );
          }
          return (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'nowrap',
              }}
              className="admin-table-actions"
            >
              <Button
                icon={<EditOutlined />}
                onClick={() => onEdit(record)}
                size="small"
                className="admin-table-action-btn"
                title={i18n.t('inventory.editTooltip')}
                aria-label={i18n.t('inventory.editTooltip')}
              />
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={() => onOpenMagazineChange(record)}
                disabled={magazineChangeDisabled}
                size="small"
                className="admin-table-action-btn admin-table-magazine-btn"
                title={i18n.t('inventory.magazineChangeButton')}
                aria-label={i18n.t('inventory.magazineChangeButton')}
              />
              <Popconfirm
                title={i18n.t('inventory.forceMagazineChangeTitle')}
                description={i18n.t('inventory.forceMagazineChangeWarning')}
                onConfirm={() => onForceMagazineChange(record)}
                okText={i18n.t('common.yes')}
                cancelText={i18n.t('common.cancel')}
                disabled={magazineChangeDisabled}
                overlayStyle={{ maxWidth: 320 }}
              >
                <Button
                  icon={<ThunderboltOutlined />}
                  disabled={magazineChangeDisabled}
                  size="small"
                  className="admin-table-action-btn"
                  title={i18n.t('inventory.forceMagazineChangeButton')}
                  aria-label={i18n.t('inventory.forceMagazineChangeButton')}
                />
              </Popconfirm>
            </div>
          );
        },
      },
    ],
    [
      editingId,
      editValues,
      setEditValues,
      componentsConfig,
      magazineChangeDisabled,
      onEdit,
      onSave,
      onCancelEdit,
      onOpenMagazineChange,
      onForceMagazineChange,
    ]
  );
}
