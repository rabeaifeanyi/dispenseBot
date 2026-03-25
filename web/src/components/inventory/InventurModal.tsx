'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Modal, Button, InputNumber } from 'antd';
import { i18n } from '@/lib/i18n';
import { spacing } from '@/styles/spacing';
import type { ComponentsConfig, InventoryItem } from '@/contexts/ApiContext';

interface InventurModalProps {
  open: boolean;
  confirmLoading: boolean;
  inventory: InventoryItem[];
  componentsConfig: ComponentsConfig | null;
  inventurLooseValues: Record<string, number>;
  inventurFullMagazines: Record<string, number>;
  setInventurLooseValues: Dispatch<SetStateAction<Record<string, number>>>;
  setInventurFullMagazines: Dispatch<SetStateAction<Record<string, number>>>;
  onOk: () => void;
  onCancel: () => void;
}

export default function InventurModal({
  open,
  confirmLoading,
  inventory,
  componentsConfig,
  inventurLooseValues,
  inventurFullMagazines,
  setInventurLooseValues,
  setInventurFullMagazines,
  onOk,
  onCancel,
}: InventurModalProps) {
  return (
    <Modal
      title={i18n.t('inventory.inventurTitle')}
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      okText={i18n.t('inventory.inventurApply')}
      cancelText={i18n.t('inventory.inventurCancel')}
      confirmLoading={confirmLoading}
      width={740}
    >
      <p style={{ marginBottom: spacing.sm, color: '#666', fontSize: 12 }}>
        {i18n.t('inventory.inventurInstruction')}
      </p>
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}
      >
        {inventory.map((item) => (
          <div
            key={item.componentId}
            style={{
              display: 'grid',
              gridTemplateColumns:
                'minmax(140px,1fr) auto 110px auto auto auto minmax(160px,auto)',
              alignItems: 'center',
              columnGap: spacing.sm,
              rowGap: 6,
            }}
          >
            <span style={{ fontStyle: 'italic', minWidth: 140 }}>
              {componentsConfig?.parts?.[item.component.type]?.displayName ??
                item.component.type}
            </span>
            <span
              style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}
            >
              {i18n.t('inventory.inventurLoose')}
            </span>
            <InputNumber
              min={0}
              value={inventurLooseValues[item.componentId] ?? 0}
              onChange={(val) =>
                setInventurLooseValues((prev) => ({
                  ...prev,
                  [item.componentId]: val ?? 0,
                }))
              }
              style={{ width: 110 }}
            />
            <span
              style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}
            >
              {i18n.t('inventory.inventurPieces')}
            </span>

            <span
              style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}
            >
              {i18n.t('inventory.inventurFullMagazines')}
            </span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                minWidth: 120,
                justifyContent: 'flex-start',
              }}
            >
              <Button
                size="small"
                onClick={() =>
                  setInventurFullMagazines((prev) => ({
                    ...prev,
                    [item.componentId]: Math.max(
                      0,
                      (prev[item.componentId] ?? 0) - 1
                    ),
                  }))
                }
              >
                −
              </Button>
              <span style={{ minWidth: 28, textAlign: 'center' }}>
                {inventurFullMagazines[item.componentId] ?? 0}
              </span>
              <Button
                size="small"
                onClick={() =>
                  setInventurFullMagazines((prev) => ({
                    ...prev,
                    [item.componentId]: (prev[item.componentId] ?? 0) + 1,
                  }))
                }
              >
                +
              </Button>
            </div>

            <span
              style={{
                fontSize: 12,
                color: '#666',
                whiteSpace: 'nowrap',
                minWidth: 160,
              }}
            >
              ({i18n.t('inventory.inventurTotalPrefix')}{' '}
              {(item.currentMagazineStock ?? 0) +
                (inventurLooseValues[item.componentId] ?? 0) +
                (inventurFullMagazines[item.componentId] ?? 0) *
                  item.magazineSize}
              )
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
