'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button, message, Modal, Card, Popover } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { i18n } from '@/lib/i18n';
import { sortByPartOrder } from '@/lib/componentOrder';
import { spacing } from '@/styles/spacing';
import { useDemo } from '@/contexts/DemoContext';
import { useApi } from '@/contexts/ApiContext';

interface ComponentInfo {
  id: string;
  componentId: string;
  currentMagazineStock: number;
  magazineSize: number;
  component?: {
    id: string;
    type: string;
    name: string;
  };
}

export const sortInventory = sortByPartOrder;

const ADMIN_SETTINGS_KEY = 'admin_settings';

type MockItem = {
  id: string;
  component: { id: string; name: string; type: string };
  currentMagazineStock: number;
  magazineSize: number;
};

function mockToComponentInfo(mock: MockItem): ComponentInfo {
  return {
    id: mock.id,
    componentId: mock.id,
    currentMagazineStock: mock.currentMagazineStock,
    magazineSize: mock.magazineSize,
    component: mock.component,
  };
}

export default function ComponentsDisplay({
  mcConnected = true,
}: {
  mcConnected?: boolean;
}) {
  const { isDemo, mockInventory } = useDemo();
  const {
    inventory: apiInventory,
    updateInventoryItem,
    refetchInventory,
    componentsConfig,
  } = useApi();
  const [refilling, setRefilling] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [refillModalItem, setRefillModalItem] = useState<any | null>(null);
  const [showRefillButton, setShowRefillButton] = useState(true);
  const [messageApi, contextHolder] = message.useMessage();

  const refillDisabled = !isDemo && mcConnected === false;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ADMIN_SETTINGS_KEY);
      if (saved) {
        const settings = JSON.parse(saved);
        setShowRefillButton(settings.showMagazineChangeButton !== false);
      }
    } catch {
      setShowRefillButton(true);
    }
  }, []);

  const partsImagesFileBaseFingerprint = useMemo(() => {
    if (!componentsConfig) return '';
    return Object.keys(componentsConfig.parts)
      .map((p) => componentsConfig.parts[p]?.images?.fileBase ?? '')
      .join('|');
  }, [componentsConfig]);

  useEffect(() => {
    if (!componentsConfig) return;
    setFailedImages(new Set());
  }, [partsImagesFileBaseFingerprint]);

  const demoComponents = useMemo(
    () =>
      isDemo
        ? mockInventory.map((m) => mockToComponentInfo(m as MockItem))
        : [],
    [isDemo, mockInventory]
  );

  const displayComponents = isDemo ? demoComponents : apiInventory;

  const orderedComponents = useMemo(
    () =>
      sortByPartOrder(displayComponents, componentsConfig?.order ?? undefined),
    [displayComponents, componentsConfig?.order]
  );

  const handleImageError = (componentType: string) => {
    if (!componentsConfig) return;
    setFailedImages((prev) => new Set([...prev, componentType]));
  };
  const handleImageLoad = (componentType: string) => {
    if (!componentsConfig) return;
    setFailedImages((prev) => {
      if (!prev.has(componentType)) return prev;
      const next = new Set(prev);
      next.delete(componentType);
      return next;
    });
  };

  const handleRefill = async (componentId: string) => {
    if (!refillModalItem || !componentsConfig) return;
    if (refillDisabled) {
      messageApi.warning(i18n.t('componentsDisplay.refillDisabled'));
      setRefillModalItem(null);
      return;
    }
    try {
      setRefilling(componentId);
      setRefillModalItem(null);
      if (isDemo) {
        messageApi.success(i18n.t('componentsDisplay.refillSuccessDemo'));
        setRefilling(null);
        return;
      }
      const magazineSize =
        apiInventory.find((c) => c.componentId === componentId)?.magazineSize ??
        refillModalItem.magazineSize;

      await updateInventoryItem(componentId, {
        currentMagazineStock: magazineSize,
      });
      void refetchInventory(true);
      messageApi.success(i18n.t('componentsDisplay.refillSuccess'));
    } catch (error) {
      console.error('Failed to refill:', error);
      messageApi.error(i18n.t('componentsDisplay.refillError'));
    } finally {
      setRefilling(null);
    }
  };

  if (!componentsConfig) {
    return null;
  }

  const cfg = componentsConfig;

  const getComponentTint = (componentType: string) => {
    const part = cfg.parts[componentType.toUpperCase()];
    return { base: part.tint.base, overlay: part.tint.overlay };
  };

  const getComponentImageFileBase = (componentType: string) =>
    cfg.parts[componentType.toUpperCase()].images.fileBase;

  const getComponentImageSrc = (componentType: string) => {
    const base = getComponentImageFileBase(componentType);
    const fileName = base.includes('.') ? base : `${base}.JPG`;
    return `/images/components/${fileName}`;
  };

  const renderLargePreview = (componentType: string) => {
    const src = getComponentImageSrc(componentType);
    const partType = componentType.toUpperCase();
    const displayName = cfg.parts[partType].displayName;
    return (
      <div style={{ width: 240 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
          {displayName}
        </div>
        <div
          style={{
            width: '100%',
            aspectRatio: '1 / 1',
            borderRadius: 12,
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          <img
            src={src}
            alt={displayName}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center top',
              display: 'block',
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={i18n.t('componentsDisplay.refillModalTitle')}
        open={!!refillModalItem}
        onOk={() =>
          refillModalItem && handleRefill(refillModalItem.componentId)
        }
        onCancel={() => setRefillModalItem(null)}
        okText={i18n.t('common.yes')}
        cancelText={i18n.t('common.no')}
        okButtonProps={{ disabled: refillDisabled }}
      >
        {!mcConnected && (
          <div
            style={{ marginBottom: spacing.sm, color: '#8c8c8c', fontSize: 12 }}
          >
            {i18n.t('componentsDisplay.disconnectedRefillHint')}
          </div>
        )}
        {refillModalItem &&
          (() => {
            const t = (
              refillModalItem.component?.type as string | undefined
            )?.toUpperCase();
            if (!t || !cfg.parts[t]) return null;
            return (
              <p>
                {i18n
                  .t('componentsDisplay.refillQuestion')
                  .replace('{component}', cfg.parts[t].displayName)
                  .replace('{size}', String(refillModalItem.magazineSize))}
              </p>
            );
          })()}
      </Modal>
      <div style={{ marginBottom: spacing.md }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: spacing.sm,
            alignItems: 'start',
          }}
        >
          {orderedComponents
            .filter(
              (
                item
              ): item is ComponentInfo & {
                component: NonNullable<ComponentInfo['component']> & {
                  type: string;
                };
              } => Boolean(item.component?.type)
            )
            .map((item) => {
              const componentType = item.component.type;

              const tint = getComponentTint(componentType);
              const cols = 6;
              const totalCells = Math.ceil(item.magazineSize / cols) * cols;
              const showPreview = !failedImages.has(componentType);

              return (
                <div key={item.id} style={{ minWidth: 150 }}>
                  <Card
                    style={{ background: '#fafafa' }}
                    cover={
                      <Popover
                        placement="bottom"
                        mouseEnterDelay={0.1}
                        styles={{ body: { padding: 10 } }}
                        content={
                          showPreview ? renderLargePreview(componentType) : null
                        }
                        trigger="hover"
                        open={showPreview ? undefined : false}
                      >
                        <div
                          className="component-magazine-grid-wrap"
                          style={{
                            width: '100%',
                            aspectRatio: '6 / 3',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(6, 1fr)',
                            gridAutoRows: '1fr',
                            gap: 0,
                            background: '#ffffff',
                            position: 'relative',
                            overflow: 'hidden',
                            cursor: showPreview ? 'zoom-in' : 'default',
                          }}
                        >
                          <div
                            aria-hidden="true"
                            style={{
                              position: 'absolute',
                              inset: 0,
                              background: tint.overlay,
                              opacity: tint.overlay === '#ffffff' ? 0 : 0.55,
                              mixBlendMode: 'multiply',
                              pointerEvents: 'none',
                              zIndex: 2,
                            }}
                          />
                          {Array.from({ length: totalCells }, (_, i) => {
                            const isSlot = i < item.magazineSize;
                            const filled =
                              isSlot && i < item.currentMagazineStock;
                            return (
                              <div
                                key={i}
                                style={{
                                  aspectRatio: '1',
                                  background: 'transparent',
                                  overflow: 'hidden',
                                  position: 'relative',
                                  zIndex: 1,
                                }}
                              >
                                {filled && showPreview && (
                                  <div
                                    className={`component-image-wrap component-image-wrap-${componentType.toLowerCase()}`}
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                    }}
                                  >
                                    <img
                                      className="component-image"
                                      src={getComponentImageSrc(componentType)}
                                      alt=""
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        objectPosition: 'center top',
                                      }}
                                      onError={() =>
                                        handleImageError(componentType)
                                      }
                                      onLoad={() =>
                                        handleImageLoad(componentType)
                                      }
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </Popover>
                    }
                    styles={{
                      body: { padding: `${spacing.xs}px ${spacing.xs + 4}px` },
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 13,
                        marginBottom: spacing.xs / 2,
                      }}
                    >
                      {cfg.parts[componentType.toUpperCase()].displayName}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: '#666',
                        marginBottom: spacing.xs,
                      }}
                    >
                      {item.currentMagazineStock}/{item.magazineSize}
                    </div>
                    {showRefillButton && (
                      <div
                        style={{ display: 'flex', justifyContent: 'center' }}
                      >
                        <Button
                          className="refill-btn"
                          type="default"
                          size="small"
                          icon={<ReloadOutlined />}
                          loading={refilling === item.componentId}
                          onClick={() => setRefillModalItem(item)}
                          disabled={refillDisabled}
                        >
                          {i18n.t('componentsDisplay.switchButton')}
                        </Button>
                      </div>
                    )}
                  </Card>
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}
