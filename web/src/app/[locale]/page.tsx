'use client';

import { useState } from 'react';
import { Button, Modal, Alert, Input, Card, Space, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useRouter, usePathname } from 'next/navigation';
import OrderForm from '@/components/OrderForm';
import QueueStatus from '@/components/QueueStatus';
import ComponentsDisplay from '@/components/ComponentsDisplay';
import MagazineChangeFlowModals from '@/components/magazine/MagazineChangeFlowModals';
import { i18n } from '@/lib/i18n';
import { useDemo } from '@/contexts/DemoContext';
import { spacing } from '@/styles/spacing';
import { useApi } from '@/contexts/ApiContext';
import { MC_STATUS_CODES } from '@/lib/magazineChangePhase';

const isProcessing = (status: string) => status === MC_STATUS_CODES.DISPENSING;

function getNormalPathFromDemo(pathname: string): string {
  const localeHomeMatch = pathname.match(/^\/([a-z]{2})\/demo\/home\/?$/i);
  if (localeHomeMatch) {
    const locale = localeHomeMatch[1];
    return `/${locale}/`;
  }

  if (
    pathname === '/demo' ||
    pathname === '/demo/home' ||
    pathname === '/demo/home/'
  )
    return '/';

  return pathname.replace(/\/[a-z]{2}\/demo/, '').replace(/\/demo/, '') || '/';
}

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const { isDemo, mockInventory, mcConnected: demoMcConnected } = useDemo();
  const {
    inventory,
    queueStatus,
    mcConnected: apiMcConnected,
    mcStatus,
    mcStatusData,
    submitOrder,
    cancelOrder,
    magazineReset,
    standaloneMagazineChange,
    startMagazineChange,
    componentsConfig,
  } = useApi();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [quickOrderCount, setQuickOrderCount] = useState(1);
  const [loadingQuickOrder, setLoadingQuickOrder] = useState(false);
  const [loadingStandaloneMagChange, setLoadingStandaloneMagChange] =
    useState(false);
  const [loadingStartMagChange, setLoadingStartMagChange] = useState(false);

  const [quickMagazineChangePromptOpen, setQuickMagazineChangePromptOpen] =
    useState(false);
  const [quickMagazineChangePartType, setQuickMagazineChangePartType] =
    useState<string | null>(null);
  const [pendingQuickOrderCount, setPendingQuickOrderCount] = useState(1);

  const [demoMcStatus, setDemoMcStatus] = useState<string>(
    MC_STATUS_CODES.WAIT_ORDER
  );
  const [demoMcStatusData, setDemoMcStatusData] = useState<any>(null);
  const [demoCurrentOrder, setDemoCurrentOrder] = useState<any>(null);

  const activeOrder = queueStatus?.activeOrder ?? null;

  const currentOrder = isDemo
    ? demoCurrentOrder
    : activeOrder &&
      (activeOrder.status === 'ORDER_READY' ||
        activeOrder.status === 'PROCESSING_ORDER' ||
        activeOrder.status === 'MAGAZINE_CHANGE_NEEDED')
    ? activeOrder
    : null;

  const actualMcConnected = isDemo ? demoMcConnected : apiMcConnected;
  const actualInventory = isDemo ? mockInventory : inventory;

  const effectiveMcStatus = isDemo
    ? demoMcStatus
    : mcStatus ?? MC_STATUS_CODES.WAIT_ORDER;
  const effectiveMcStatusData = isDemo ? demoMcStatusData : mcStatusData;

  const handleMcStartMagazineChange = async () => {
    if (isDemo) return;
    setLoadingStartMagChange(true);
    try {
      await startMagazineChange();
    } catch (e) {
      console.error('Start magazine change failed:', e);
      message.error(i18n.t('home.magazineChangeStartFailed'));
    } finally {
      setLoadingStartMagChange(false);
    }
  };

  const handleStandaloneMagazineConfirm = async () => {
    setLoadingStandaloneMagChange(true);
    try {
      await standaloneMagazineChange();
    } catch (e) {
      console.error('Standalone magazine change failed:', e);
      message.error(i18n.t('home.standaloneMagazineChangeFailed'));
    } finally {
      setLoadingStandaloneMagChange(false);
    }
  };

  const handleOrderSuccess = () => {
    setIsModalOpen(false);
    if (isDemo) {
      setTimeout(() => {
        setDemoMcStatus(MC_STATUS_CODES.FINISHED);
        setDemoCurrentOrder({
          status: 'COMPLETED',
          orderNumber: 'DEMO-' + Date.now(),
        });
      }, 3000);
    }
  };

  const getMinAvailable = () => {
    if (!actualInventory || actualInventory.length === 0) return 0;
    const availableForEach = actualInventory
      .map((item) => {
        const maxOrder = Number(item.maxOrderQuantity);
        const magazineSize = Number(item.magazineSize);
        const currentStock = Number(item.currentMagazineStock);
        const totalStock = Number(item.totalStock);

        if (
          !Number.isFinite(maxOrder) ||
          !Number.isFinite(magazineSize) ||
          !Number.isFinite(currentStock)
        ) {
          return null;
        }

        const magazineBased = (maxOrder - 1) * magazineSize + currentStock;
        return Number.isFinite(totalStock)
          ? Math.min(magazineBased, totalStock)
          : magazineBased;
      })
      .filter((v): v is number => v !== null && Number.isFinite(v));

    if (availableForEach.length === 0) return 0;
    return Math.min(...availableForEach);
  };

  const handleQuickOrder = async () => {
    const minAvailable = getMinAvailable();

    if (quickOrderCount > minAvailable) {
      alert(
        i18n.t('home.notEnoughStock').replace('{max}', String(minAvailable))
      );
      return;
    }

    if (isDemo) {
      setQuickOrderCount(1);
      setDemoMcStatus(MC_STATUS_CODES.DISPENSING);
      setTimeout(() => {
        setDemoMcStatus(MC_STATUS_CODES.FINISHED);
        setDemoCurrentOrder({
          status: MC_STATUS_CODES.FINISHED,
          orderNumber: 'DEMO-' + Date.now(),
        });
      }, 3000);
      return;
    }

    // Vorwarnung: falls die Menge > aktueller Magazinfüllstand ist,
    // wird später ein Magazinwechsel nötig (System kann währenddessen weiterlaufen,
    // aber der User muss irgendwann bestätigen).
    const affectedCandidates = (actualInventory || [])
      .map((it: any) => ({
        partType: it?.component?.type as string | undefined,
        inMag: Number(it?.currentMagazineStock ?? 0),
      }))
      .filter((x: any) => x.partType && quickOrderCount > x.inMag);

    if (affectedCandidates.length > 0) {
      const count = quickOrderCount;
      setPendingQuickOrderCount(count);
      setQuickMagazineChangePartType(affectedCandidates[0].partType ?? null);
      setQuickMagazineChangePromptOpen(true);
      return;
    }

    setLoadingQuickOrder(true);
    const partTypes =
      componentsConfig?.order ?? Object.keys(componentsConfig?.parts ?? {});
    try {
      await submitOrder(
        partTypes.map((type) => ({
          componentType: type,
          quantity: quickOrderCount,
        }))
      );

      setQuickOrderCount(1);
    } catch (error) {
      console.error('Quick order failed:', error);
    } finally {
      setLoadingQuickOrder(false);
    }
  };

  const minAvailable = getMinAvailable();
  const safeMaxAvailable = Number.isFinite(minAvailable) ? minAvailable : 0;

  return (
    <div>
      <ComponentsDisplay mcConnected={actualMcConnected !== false} />

      <Card
        style={{ marginBottom: spacing.md, minHeight: 100 }}
        styles={{ body: { padding: spacing.md } }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: spacing.sm,
          }}
        >
          <Space wrap>
            <span>{i18n.t('home.quickOrderLabel')}</span>
            <Input
              type="number"
              min={1}
              max={safeMaxAvailable}
              value={quickOrderCount}
              onChange={(e) =>
                setQuickOrderCount(parseInt(e.target.value) || 1)
              }
              style={{ width: 70 }}
              disabled={actualMcConnected === false}
            />
            <span>{i18n.t('home.quickOrderPen')}</span>
            <span style={{ fontSize: 12, color: '#888' }}>
              {i18n
                .t('home.quickOrderMaxAvailable')
                .replace('{count}', String(minAvailable))}
            </span>
            <Button
              type="default"
              onClick={handleQuickOrder}
              disabled={
                actualMcConnected === false ||
                quickOrderCount < 1 ||
                quickOrderCount > minAvailable ||
                loadingQuickOrder
              }
              loading={loadingQuickOrder}
            >
              {i18n.t('home.quickOrderButton')}
            </Button>
          </Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsModalOpen(true)}
            disabled={actualMcConnected === false}
          >
            {i18n.t('orders.newOrder')}
          </Button>
        </div>
      </Card>

      {isDemo && (
        <Alert
          message={i18n.t('home.demoAlertTitle')}
          description={
            <span>
              {i18n.t('home.demoAlertDescription')}{' '}
              <Button
                type="link"
                size="small"
                onClick={() => router.push(getNormalPathFromDemo(pathname))}
                style={{ padding: 0 }}
              >
                {i18n.t('home.backToNormalMode')}
              </Button>
            </span>
          }
          type="info"
          showIcon
          style={{ marginBottom: spacing.md }}
        />
      )}

      <div style={{ minHeight: 'auto' }}>
        {currentOrder && currentOrder.status === 'PROCESSING_ORDER' && (
          <Alert
            message={i18n.t('home.orderProcessingTitle')}
            description={i18n.t('home.orderProcessingDescription')}
            type="info"
            showIcon
            style={{ marginBottom: spacing.md }}
          />
        )}

        <MagazineChangeFlowModals
          isDemo={isDemo}
          activeOrder={activeOrder}
          currentOrder={currentOrder}
          setDemoCurrentOrder={setDemoCurrentOrder}
          queueStatus={queueStatus}
          componentsConfig={componentsConfig}
          effectiveMcStatusData={effectiveMcStatusData}
          actualMcConnected={actualMcConnected !== false}
          loadingStandaloneMagChange={loadingStandaloneMagChange}
          loadingStartMagChange={loadingStartMagChange}
          cancelOrder={cancelOrder}
          magazineReset={magazineReset}
          onMcStartMagazineChange={handleMcStartMagazineChange}
          onStandaloneMagazineConfirm={handleStandaloneMagazineConfirm}
        />

        {currentOrder && currentOrder.status === 'ORDER_READY' && (
          <Alert
            message={i18n.t('home.pickupWaitingTitle')}
            description={i18n.t('home.pickupWaitingDescription')}
            type="success"
            showIcon
            style={{ marginBottom: spacing.md }}
          />
        )}

        {isProcessing(effectiveMcStatus) && !currentOrder && (
          <Alert
            message={i18n.t('home.orderProcessingTitle')}
            description={i18n.t('home.orderProcessingDescription')}
            type="info"
            showIcon
            style={{ marginBottom: spacing.md }}
          />
        )}
      </div>

      {!isDemo && actualMcConnected === false && (
        <Alert
          message={i18n.t('home.automatDisconnectedTitle')}
          description={
            <div>
              {i18n.t('home.automatDisconnectedBeforeLink')}
              <a
                onClick={() => {
                  const locale = pathname.split('/')[1];
                  router.push(`/${locale}/demo/home`);
                }}
                style={{ cursor: 'pointer' }}
              >
                {i18n.t('home.demoVersionLink')}
              </a>
              {i18n.t('home.automatDisconnectedAfterLink')}
            </div>
          }
          type="error"
          showIcon
          style={{ marginBottom: spacing.md }}
        />
      )}

      <Modal
        title={
          <span className="order-modal-title">
            {isDemo
              ? `${i18n.t('orderForm.title')} (Demo)`
              : i18n.t('orderForm.title')}
          </span>
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={560}
        style={{ top: 20 }}
      >
        <OrderForm onSuccess={handleOrderSuccess} demoMode={isDemo} />
      </Modal>

      <Modal
        title={i18n.t('home.quickMagazineChangeExpectedTitle')}
        open={quickMagazineChangePromptOpen}
        onCancel={() => setQuickMagazineChangePromptOpen(false)}
        onOk={async () => {
          setQuickMagazineChangePromptOpen(false);
          setLoadingQuickOrder(true);
          const pendingPartTypes =
            componentsConfig?.order ??
            Object.keys(componentsConfig?.parts ?? {});
          try {
            await submitOrder(
              pendingPartTypes.map((type) => ({
                componentType: type,
                quantity: pendingQuickOrderCount,
              }))
            );
            setQuickOrderCount(1);
          } catch (e) {
            console.error('Quick order failed:', e);
          } finally {
            setLoadingQuickOrder(false);
          }
        }}
        okText={i18n.t('home.orderAnyway')}
        cancelText={i18n.t('common.cancel')}
        destroyOnHidden
      >
        <div style={{ fontSize: 12, color: '#666' }}>
          {i18n.t('home.quickMagazineChangeHint')}
        </div>
      </Modal>

      {!isDemo && <QueueStatus />}
    </div>
  );
}
