'use client';

import { Modal } from 'antd';
import { i18n } from '@/lib/i18n';
import type { ComponentsConfig, InventoryItem } from '@/contexts/ApiContext';
import { getMagazineLabelColor } from './magazineLabelColor';

interface MagazineChangeModalProps {
  record: InventoryItem | null;
  open: boolean;
  componentsConfig: ComponentsConfig | null;
  magazineChangeDisabled: boolean;
  onOk: () => void;
  onCancel: () => void;
}

export default function MagazineChangeModal({
  record,
  open,
  componentsConfig,
  magazineChangeDisabled,
  onOk,
  onCancel,
}: MagazineChangeModalProps) {
  const partType = record?.component.type;
  const part = partType ? componentsConfig?.parts?.[partType] : undefined;
  const displayName = part?.displayName ?? record?.component.type ?? '';
  const magazineLabel = part?.magazineLabel;

  return (
    <Modal
      title={i18n.t('inventory.magazineChangeTitle')}
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      okText={i18n.t('common.yes')}
      cancelText={i18n.t('common.cancel')}
      okButtonProps={{ disabled: magazineChangeDisabled }}
    >
      {record && partType && (
        <p>
          {i18n
            .t('inventory.magazineChangeModalBase')
            .replace('{size}', String(record.magazineSize))
            .replace('{component}', displayName)}
          {magazineLabel && partType && (
            <>
              {' '}
              <span
                style={{
                  color: getMagazineLabelColor(partType, componentsConfig),
                }}
              >
                ({magazineLabel})
              </span>
            </>
          )}
          .
        </p>
      )}
    </Modal>
  );
}
