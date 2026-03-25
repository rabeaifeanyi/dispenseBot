'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button, message, Card, Popover, Popconfirm, Tooltip } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
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
    componentsConfig,
    queueStatus,
    forceStartMagazineChange,
  } = useApi();
  const [forcing, setForcing] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [showRefillButton, setShowRefillButton] = useState(true);
  const [messageApi, contextHolder] = message.useMessage();

  const activeOrderStatus = queueStatus?.activeOrder?.status;
  const disconnected = !isDemo && mcConnected === false;
  const forceDisabled =
    disconnected ||
    activeOrderStatus === 'ORDER_READY' ||
    activeOrderStatus === 'PROCESSING_ORDER' ||
    activeOrderStatus === 'MAGAZINE_CHANGE_NEEDED';

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

  const handleForceMagazineChange = async (item: ComponentInfo) => {
    if (!componentsConfig || forceDisabled) return;
    const t = (item.component?.type as string | undefined)?.toUpperCase();
    const part = t ? componentsConfig.parts[t]?.mc?.magazinIndex : undefined;
    if (part == null) {
      messageApi.error(i18n.t('inventory.forceMagazineChangeFailed'));
      return;
    }
    try {
      setForcing(item.componentId);
      if (isDemo) {
        messageApi.success(i18n.t('inventory.forceMagazineChangeSuccess'));
        return;
      }
      await forceStartMagazineChange(part);
      messageApi.success(i18n.t('inventory.forceMagazineChangeSuccess'));
    } catch (error) {
      console.error('Failed to start magazine change:', error);
      messageApi.error(i18n.t('inventory.forceMagazineChangeFailed'));
    } finally {
      setForcing(null);
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

  const forceButtonTooltip = (() => {
    if (!forceDisabled) {
      return i18n.t('inventory.forceMagazineChangeButton');
    }
    if (disconnected) {
      return i18n.t('componentsDisplay.refillDisabled');
    }
    if (activeOrderStatus === 'ORDER_READY') {
      return i18n.t('inventory.forceMagazineChangeBlockedPickup');
    }
    if (
      activeOrderStatus === 'PROCESSING_ORDER' ||
      activeOrderStatus === 'MAGAZINE_CHANGE_NEEDED'
    ) {
      return i18n.t('inventory.forceMagazineChangeBlockedOrderFlow');
    }
    return i18n.t('inventory.forceMagazineChangeButton');
  })();

  return (
    <>
      {contextHolder}
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
                        <Tooltip title={forceButtonTooltip}>
                          <Popconfirm
                            title={i18n.t('inventory.forceMagazineChangeTitle')}
                            description={i18n.t(
                              'inventory.forceMagazineChangeWarning'
                            )}
                            onConfirm={() =>
                              void handleForceMagazineChange(item)
                            }
                            okText={i18n.t('common.yes')}
                            cancelText={i18n.t('common.cancel')}
                            disabled={forceDisabled}
                            overlayStyle={{ maxWidth: 320 }}
                          >
                            <span>
                              <Button
                                className="refill-btn"
                                type="default"
                                size="small"
                                icon={<ThunderboltOutlined />}
                                loading={forcing === item.componentId}
                                disabled={forceDisabled}
                                aria-label={i18n.t(
                                  'inventory.forceMagazineChangeButton'
                                )}
                              />
                            </span>
                          </Popconfirm>
                        </Tooltip>
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
