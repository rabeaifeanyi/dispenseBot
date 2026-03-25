'use client';

import { Button, Modal, Space, message } from 'antd';
import { i18n } from '@/lib/i18n';
import { spacing } from '@/styles/spacing';
import type {
  ComponentsConfig,
  McStatusResponse,
  QueueStatusResponse,
} from '@/contexts/ApiContext';
import { getMagChangeUiPhase } from '@/lib/magazineChangePhase';

type QueueOrder = NonNullable<QueueStatusResponse['activeOrder']>;

type Props = {
  isDemo: boolean;
  activeOrder: QueueOrder | null;
  currentOrder: QueueOrder | null;
  setDemoCurrentOrder: (v: unknown) => void;
  queueStatus: QueueStatusResponse | null;
  componentsConfig: ComponentsConfig | null;
  effectiveMcStatusData: McStatusResponse | null;
  actualMcConnected: boolean;
  loadingStandaloneMagChange: boolean;
  loadingStartMagChange: boolean;
  cancelOrder: (orderId: string) => Promise<void>;
  magazineReset: (orderId: string) => Promise<void>;
  onMcStartMagazineChange: () => Promise<void>;
  onStandaloneMagazineConfirm: () => Promise<void>;
};

export default function MagazineChangeFlowModals({
  isDemo,
  activeOrder,
  currentOrder,
  setDemoCurrentOrder,
  queueStatus,
  componentsConfig,
  effectiveMcStatusData,
  actualMcConnected,
  loadingStandaloneMagChange,
  loadingStartMagChange,
  cancelOrder,
  magazineReset,
  onMcStartMagazineChange,
  onStandaloneMagazineConfirm,
}: Props) {
  const magChangeUiPhase = getMagChangeUiPhase(effectiveMcStatusData);

  const openOrderModal =
    !!currentOrder && currentOrder.status === 'MAGAZINE_CHANGE_NEEDED';

  // Backend sets mcNeedsMagazineChange while MC is in mag-change state but the order
  // is not yet MAGAZINE_CHANGE_NEEDED — that includes PROCESSING_ORDER. Showing the
  // standalone modal in that window flashes the wrong UI before the order modal opens.
  const openStandaloneModal =
    !isDemo &&
    !!queueStatus?.mcNeedsMagazineChange &&
    activeOrder?.status !== 'MAGAZINE_CHANGE_NEEDED' &&
    activeOrder?.status !== 'ORDER_READY' &&
    activeOrder?.status !== 'PROCESSING_ORDER';

  const parts = componentsConfig?.parts ?? {};
  const affectedPartTypes = Object.entries(parts)
    .filter(([, cfg]) => {
      const key = `magazin${cfg.mc.magazinIndex}_wechseln`;
      return !!(effectiveMcStatusData as Record<string, unknown>)?.[key];
    })
    .map(([type]) => type);

  const affectedNames =
    affectedPartTypes.length === 0
      ? null
      : affectedPartTypes
          .map((type) => parts[type]?.displayName ?? type)
          .join(', ');

  return (
    <>
      <Modal
        title={i18n.t('home.magazineChangeRequiredTitle')}
        open={openOrderModal}
        onCancel={() => {}}
        closable={false}
        maskClosable={false}
        footer={
          <Space>
            <Button
              danger
              onClick={async () => {
                if (isDemo) {
                  setDemoCurrentOrder(null);
                  return;
                }
                if (!currentOrder?.id) return;
                try {
                  await cancelOrder(currentOrder.id);
                } catch (e) {
                  console.error('Cancel order failed:', e);
                  message.error(i18n.t('home.cancelOrderFailed'));
                }
              }}
            >
              {i18n.t('home.cancelOrderButton')}
            </Button>
            {magChangeUiPhase === 'WAIT_START' && (
              <Button
                type="default"
                loading={loadingStartMagChange}
                disabled={!isDemo && actualMcConnected === false}
                onClick={() => void onMcStartMagazineChange()}
              >
                {i18n.t('home.magazineChangeStartButton')}
              </Button>
            )}
            <Button
              type="primary"
              disabled={
                !isDemo &&
                (actualMcConnected === false ||
                  magChangeUiPhase !== 'CONFIRM_INSERT')
              }
              onClick={async () => {
                if (!currentOrder?.id) return;
                if (isDemo) {
                  setDemoCurrentOrder(null);
                  return;
                }
                if (actualMcConnected === false) return;
                await magazineReset(currentOrder.id);
              }}
            >
              {i18n.t('home.magazineChangedButton')}
            </Button>
          </Space>
        }
        destroyOnHidden
      >
        <p style={{ marginBottom: spacing.sm }}>
          {magChangeUiPhase === 'WAIT_START'
            ? i18n.t('home.magazineChangeWaitStart')
            : magChangeUiPhase === 'CALIBRATING'
            ? i18n.t('home.magazineChangeCalibrating')
            : i18n.t('home.magazineEmptyDuringProcessing')}
        </p>
        {affectedNames && (
          <div style={{ fontSize: 12, color: '#666' }}>
            {i18n.t('home.affectedPartLabel')} <b>{affectedNames}</b>
          </div>
        )}
      </Modal>

      <Modal
        title={i18n.t('home.standaloneMagazineChangeTitle')}
        open={openStandaloneModal}
        onCancel={() => {}}
        closable={false}
        maskClosable={false}
        footer={
          <Space>
            {magChangeUiPhase === 'WAIT_START' && (
              <Button
                type="default"
                loading={loadingStartMagChange}
                disabled={actualMcConnected === false}
                onClick={() => void onMcStartMagazineChange()}
              >
                {i18n.t('home.magazineChangeStartButton')}
              </Button>
            )}
            {magChangeUiPhase === 'CONFIRM_INSERT' && (
              <Button
                type="primary"
                loading={loadingStandaloneMagChange}
                disabled={actualMcConnected === false}
                onClick={() => void onStandaloneMagazineConfirm()}
              >
                {i18n.t('home.magazineChangedButton')}
              </Button>
            )}
          </Space>
        }
        destroyOnHidden
      >
        <p style={{ marginBottom: spacing.sm }}>
          {magChangeUiPhase === 'WAIT_START'
            ? i18n.t('home.standaloneMagazineChangeBodyWaitStart')
            : magChangeUiPhase === 'CALIBRATING'
            ? i18n.t('home.magazineChangeCalibrating')
            : i18n.t('home.standaloneMagazineChangeBodyConfirm')}
        </p>
        {affectedNames && (
          <div style={{ fontSize: 12, color: '#666' }}>
            {i18n.t('home.affectedPartLabel')} <b>{affectedNames}</b>
          </div>
        )}
      </Modal>
    </>
  );
}
