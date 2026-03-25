'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const CACHE_KEY_INVENTORY = 'api_cache_inventory';
const CACHE_KEY_ORDERS = 'api_cache_orders';

function getCachedData<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(key);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

function setCachedData<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }
}

function abortSignalWithTimeout(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function isAbortOrTimeoutError(err: unknown): boolean {
  const name = (err as any)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

async function safeReadJson<T>(response: Response): Promise<T | null> {
  const contentLength = response.headers.get('content-length');
  if (contentLength === '0') return null;
  try {
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

export interface InventoryItem {
  id: string;
  componentId: string;
  totalStock: number;
  currentMagazineStock: number;
  warningStock: number;
  magazineCount: number;
  magazineSize: number;
  maxOrderQuantity: number;
  component: {
    id: string;
    type: string;
    name: string;
  };
}

export interface Order {
  id: string;
  timestamp: string;
  status: string;
  queuePosition?: number;
  items?: Array<{
    componentId: string;
    quantity: number;
    dispensedQuantity?: number;
    component?: {
      id?: string;
      type?: string;
      name?: string;
    };
  }>;
}

type QueueStatusOrderItem = {
  id?: string;
  componentId: string;
  quantity: number;
  component?: { id?: string; type?: string; name?: string };
};

type QueueStatusOrder = {
  id: string;
  orderNumber?: string;
  status: string;
  totalItems?: number;
  magazineChangeNeeded?: boolean;
  items?: QueueStatusOrderItem[];
};

export interface QueueStatusResponse {
  isAutomatBusy: boolean;
  queueLength: number;
  activeOrder: QueueStatusOrder | null;
  queuedOrders: QueueStatusOrder[];
  mcNeedsMagazineChange?: boolean;
}

export interface McStatusResponse {
  status_bin: string;
  warte_auf_magazin_einsetzen?: number | boolean;
  [key: string]: unknown;
}

export type ComponentsConfig = {
  version: number;
  order?: string[];
  parts: Record<
    string,
    {
      displayName: string;
      magazineLabel: string;
      tint: { base: string; overlay: string };
      images: { fileBase: string };
      mc: { wertIndex: number; antwortIndex: number; magazinIndex: number };
    }
  >;
  meta?: {
    mtimeMs?: number;
    sizeBytes?: number;
  };
};

interface ApiContextType {
  inventory: InventoryItem[];
  orders: Order[];
  loadingInventory: boolean;
  loadingOrders: boolean;
  queueStatus: QueueStatusResponse | null;
  loadingQueueStatus: boolean;
  mcStatus: string | null;
  mcStatusData: McStatusResponse | null;
  mcConnected: boolean;
  componentsConfig: ComponentsConfig | null;
  loadingComponentsConfig: boolean;
  errorInventory: string | null;
  errorOrders: string | null;

  refetchInventory: (forceRefresh?: boolean) => Promise<InventoryItem[]>;
  refetchOrders: (forceRefresh?: boolean) => Promise<Order[]>;
  refetchQueueStatus: (forceRefresh?: boolean) => Promise<QueueStatusResponse>;
  refetchMcStatus: (forceRefresh?: boolean) => Promise<McStatusResponse | null>;
  updateInventoryItem: (
    componentId: string,
    payload: {
      totalStock?: number;
      warningStock?: number;
      currentMagazineStock?: number;
      magazineCount?: number;
      magazineSize?: number;
      maxOrderQuantity?: number;
    }
  ) => Promise<any>;
  submitOrder: (
    items: Array<{ componentType: string; quantity: number }>
  ) => Promise<any>;
  cancelOrder: (orderId: string) => Promise<void>;
  magazineReset: (orderId: string) => Promise<void>;
  standaloneMagazineChange: () => Promise<void>;
  startMagazineChange: () => Promise<void>;
  forceStartMagazineChange: (part: number) => Promise<void>;
}

const ApiContext = createContext<ApiContextType | undefined>(undefined);

const STATUS_CODES = {
  NO_CLIENT: '0000',
  WAIT_ORDER: '0001',
  DISPENSING: '0010',
  FINISHED: '0011',
  MAG_CHANGE: '0100',
  CALIBRATING: '0101',
} as const;

let inventoryCache: InventoryItem[] | null = null;
let inventoryFetch: Promise<InventoryItem[]> | null = null;
let inventoryCacheTime = 0;

let ordersCache: Order[] | null = null;
let ordersFetch: Promise<Order[]> | null = null;
let ordersCacheTime = 0;

let queueCache: QueueStatusResponse | null = null;
let queueFetch: Promise<QueueStatusResponse> | null = null;
let queueCacheTime = 0;

let mcFetch: Promise<McStatusResponse | null> | null = null;

const INVENTORY_CACHE_EXPIRY = 5000;
const ORDERS_CACHE_EXPIRY = 3000;
const QUEUE_CACHE_EXPIRY = 800;

function initializeFromLocalStorage() {
  inventoryCache = getCachedData<InventoryItem[]>(CACHE_KEY_INVENTORY) || null;
  ordersCache = getCachedData<Order[]>(CACHE_KEY_ORDERS) || null;
}

const EMPTY_QUEUE: QueueStatusResponse = {
  isAutomatBusy: false,
  queueLength: 0,
  activeOrder: null,
  queuedOrders: [],
};

export function ApiProvider({ children }: { children: ReactNode }) {
  const [inventoryServer, setInventoryServer] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [queueStatus, setQueueStatus] = useState<QueueStatusResponse | null>(
    EMPTY_QUEUE
  );
  const [loadingQueueStatus, setLoadingQueueStatus] = useState(false);
  const [mcStatus, setMcStatus] = useState<string | null>(
    STATUS_CODES.WAIT_ORDER
  );
  const [mcStatusData, setMcStatusData] = useState<McStatusResponse | null>(
    null
  );
  const [mcConnected, setMcConnected] = useState(false);
  const [errorInventory, setErrorInventory] = useState<string | null>(null);
  const [errorOrders, setErrorOrders] = useState<string | null>(null);
  const [componentsConfig, setComponentsConfig] =
    useState<ComponentsConfig | null>(null);
  const [loadingComponentsConfig, setLoadingComponentsConfig] = useState(false);

  const isMountedRef = useRef(true);
  const initializedRef = useRef(false);
  const componentsConfigStateRef = useRef<ComponentsConfig | null>(null);
  const componentsConfigMtimeMsRef = useRef<number | null>(null);
  const componentsConfigOrderKeyRef = useRef<string | null>(null);
  const componentsConfigPollingRef = useRef<NodeJS.Timeout | null>(null);
  const ordersPollingRef = useRef<NodeJS.Timeout | null>(null);
  const inventoryPollingRef = useRef<NodeJS.Timeout | null>(null);
  const queuePollingRef = useRef<NodeJS.Timeout | null>(null);
  const mcPollingRef = useRef<NodeJS.Timeout | null>(null);

  const pathname = usePathname();
  const isDemo = /\/demo(\/|$)/.test(pathname);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      initializeFromLocalStorage();

      if (inventoryCache && isMountedRef.current) {
        setInventoryServer(inventoryCache);
      }
      if (ordersCache && isMountedRef.current) {
        setOrders(ordersCache);
      }

      const fetchComponentsConfig = async () => {
        try {
          setLoadingComponentsConfig(true);
          const response = await fetch(`${API_URL}/config`, {
            cache: 'no-store',
            signal: abortSignalWithTimeout(5000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const data = (await response.json()) as ComponentsConfig;
          const mtimeMs = data?.meta?.mtimeMs ?? null;
          const orderKey = Array.isArray(data?.order)
            ? data.order.join('|')
            : '';

          if (isMountedRef.current) {
            if (
              mtimeMs !== null &&
              componentsConfigMtimeMsRef.current === mtimeMs &&
              componentsConfigOrderKeyRef.current === orderKey
            ) {
              return;
            }
            componentsConfigMtimeMsRef.current = mtimeMs;
            componentsConfigOrderKeyRef.current = orderKey;
            setComponentsConfig(data);
            componentsConfigStateRef.current = data;
          }
        } catch {
          if (
            isMountedRef.current &&
            componentsConfigStateRef.current === null
          ) {
            setComponentsConfig(null);
            componentsConfigStateRef.current = null;
          }
        } finally {
          if (isMountedRef.current) setLoadingComponentsConfig(false);
        }
      };

      void fetchComponentsConfig();
      componentsConfigPollingRef.current = setInterval(
        () => void fetchComponentsConfig(),
        5000
      );
    }

    return () => {
      isMountedRef.current = false;
      if (componentsConfigPollingRef.current)
        clearInterval(componentsConfigPollingRef.current);
      if (ordersPollingRef.current) clearTimeout(ordersPollingRef.current);
      if (inventoryPollingRef.current)
        clearTimeout(inventoryPollingRef.current);
      if (queuePollingRef.current) clearTimeout(queuePollingRef.current);
      if (mcPollingRef.current) clearTimeout(mcPollingRef.current);
    };
  }, []);

  const refetchInventory = useCallback(
    async (forceRefresh = false): Promise<InventoryItem[]> => {
      if (
        !forceRefresh &&
        inventoryCache &&
        Date.now() - inventoryCacheTime < INVENTORY_CACHE_EXPIRY
      ) {
        return inventoryCache;
      }

      if (!forceRefresh && inventoryFetch) {
        return inventoryFetch;
      }

      setLoadingInventory(true);

      inventoryFetch = (async () => {
        try {
          const response = await fetch(`${API_URL}/inventory`, {
            cache: 'no-store',
            signal: abortSignalWithTimeout(10000),
          });

          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const data = await response.json();
          const inventoryArray: InventoryItem[] = Array.isArray(data)
            ? data
            : Object.values(data);

          inventoryCache = inventoryArray;
          inventoryCacheTime = Date.now();
          setCachedData(CACHE_KEY_INVENTORY, inventoryArray);

          if (isMountedRef.current) {
            setInventoryServer(inventoryArray);
            setErrorInventory(null);
          }

          return inventoryArray;
        } catch (err) {
          if (isAbortOrTimeoutError(err)) {
            if (isMountedRef.current && inventoryCache) {
              setInventoryServer(inventoryCache);
            }
            return inventoryCache ?? [];
          }
          if (isMountedRef.current) {
            setErrorInventory(String(err));
            console.error('Failed to fetch inventory:', err);
          }
          return inventoryCache ?? [];
        } finally {
          inventoryFetch = null;
          if (isMountedRef.current) setLoadingInventory(false);
        }
      })();

      return inventoryFetch;
    },
    []
  );

  const refetchOrders = useCallback(
    async (forceRefresh = false): Promise<Order[]> => {
      if (
        !forceRefresh &&
        ordersCache &&
        Date.now() - ordersCacheTime < ORDERS_CACHE_EXPIRY
      ) {
        return ordersCache;
      }

      if (!forceRefresh && ordersFetch) {
        return ordersFetch;
      }

      setLoadingOrders(true);

      ordersFetch = (async () => {
        try {
          const response = await fetch(`${API_URL}/orders`, {
            cache: 'no-store',
            signal: abortSignalWithTimeout(10000),
          });

          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const data = await response.json();
          const ordersArray = Array.isArray(data) ? data : Object.values(data);

          const normalizedOrders: Order[] = ordersArray.map((o: any) => ({
            ...o,
            timestamp: o?.timestamp ?? o?.createdAt ?? new Date().toISOString(),
          }));

          ordersCache = normalizedOrders;
          ordersCacheTime = Date.now();
          setCachedData(CACHE_KEY_ORDERS, normalizedOrders);

          if (isMountedRef.current) {
            setOrders(normalizedOrders);
            setErrorOrders(null);
          }

          return normalizedOrders;
        } catch (err) {
          if (isAbortOrTimeoutError(err)) {
            if (isMountedRef.current && ordersCache) setOrders(ordersCache);
            return ordersCache ?? [];
          }
          if (isMountedRef.current) {
            setErrorOrders(String(err));
            console.error('Failed to fetch orders:', err);
          }
          return ordersCache ?? [];
        } finally {
          ordersFetch = null;
          if (isMountedRef.current) setLoadingOrders(false);
        }
      })();

      return ordersFetch;
    },
    []
  );

  const refetchQueueStatus = useCallback(
    async (forceRefresh = false): Promise<QueueStatusResponse> => {
      if (
        !forceRefresh &&
        queueCache &&
        Date.now() - queueCacheTime < QUEUE_CACHE_EXPIRY
      ) {
        return queueCache;
      }

      if (!forceRefresh && queueFetch) {
        return queueFetch;
      }

      setLoadingQueueStatus(true);

      queueFetch = (async () => {
        try {
          const response = await fetch(`${API_URL}/orders/queue/status`, {
            cache: 'no-store',
            signal: abortSignalWithTimeout(10000),
          });

          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const data = await safeReadJson<QueueStatusResponse>(response);
          const normalized: QueueStatusResponse = {
            isAutomatBusy: Boolean(data?.isAutomatBusy),
            queueLength: Number(data?.queueLength) || 0,
            activeOrder: data?.activeOrder || null,
            queuedOrders: Array.isArray(data?.queuedOrders)
              ? data.queuedOrders
              : [],
            mcNeedsMagazineChange: Boolean(data?.mcNeedsMagazineChange),
          };

          queueCache = normalized;
          queueCacheTime = Date.now();

          if (isMountedRef.current) {
            setQueueStatus((prev) => {
              const key = (q: QueueStatusResponse | null) =>
                `${q?.queueLength ?? 0}|${q?.activeOrder?.id ?? ''}|${
                  q?.activeOrder?.status ?? ''
                }|${q?.queuedOrders?.length ?? 0}|${
                  q?.mcNeedsMagazineChange ?? false
                }`;
              return key(prev) === key(normalized) ? prev : normalized;
            });
          }

          return normalized;
        } catch (err) {
          const fallback = queueCache ?? EMPTY_QUEUE;
          if (isAbortOrTimeoutError(err)) {
            if (isMountedRef.current) setQueueStatus(fallback);
            return fallback;
          }
          if (isMountedRef.current) {
            console.warn('Queue status fetch failed:', err);
            setQueueStatus(fallback);
          }
          return fallback;
        } finally {
          queueFetch = null;
          if (isMountedRef.current) setLoadingQueueStatus(false);
        }
      })();

      return queueFetch;
    },
    []
  );

  const refetchMcStatus = useCallback(
    async (forceRefresh = false): Promise<McStatusResponse | null> => {
      if (!forceRefresh && mcFetch) return mcFetch;

      mcFetch = (async () => {
        try {
          const response = await fetch(`${API_URL}/orders/mc/status`, {
            cache: 'no-store',
            signal: abortSignalWithTimeout(10000),
          });

          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const data = await safeReadJson<McStatusResponse>(response);

          if (isMountedRef.current) {
            if (!data) {
              setMcConnected(false);
              setMcStatus(STATUS_CODES.WAIT_ORDER);
              setMcStatusData(null);
              return null;
            }

            const statusBin =
              typeof data.status_bin === 'string' &&
              /^[01]{4}$/.test(data.status_bin)
                ? data.status_bin
                : STATUS_CODES.WAIT_ORDER;

            setMcStatus((prev) => (prev === statusBin ? prev : statusBin));
            setMcStatusData((prev) => (prev === data ? prev : data));
            setMcConnected(true);
          }

          return data;
        } catch (err) {
          if (isMountedRef.current) {
            if (!isAbortOrTimeoutError(err)) {
              console.warn('MC status fetch failed:', err);
            }
            setMcConnected(false);
            setMcStatus(STATUS_CODES.WAIT_ORDER);
            setMcStatusData(null);
          }
          return null;
        } finally {
          mcFetch = null;
        }
      })();

      return mcFetch;
    },
    []
  );

  useEffect(() => {
    refetchInventory();
    refetchOrders();

    const inventoryPolling = setInterval(
      () => void refetchInventory(true),
      5000
    );
    inventoryPollingRef.current = inventoryPolling;

    const ordersPolling = setInterval(() => void refetchOrders(true), 5000);
    ordersPollingRef.current = ordersPolling;

    let queuePolling: NodeJS.Timeout | null = null;
    let mcPolling: NodeJS.Timeout | null = null;

    if (!isDemo) {
      void refetchQueueStatus(true);
      void refetchMcStatus(true);

      queuePolling = setInterval(() => void refetchQueueStatus(true), 1000);
      queuePollingRef.current = queuePolling;

      mcPolling = setInterval(() => void refetchMcStatus(true), 1000);
      mcPollingRef.current = mcPolling;
    }

    return () => {
      clearInterval(inventoryPolling);
      clearInterval(ordersPolling);
      if (queuePolling) clearInterval(queuePolling);
      if (mcPolling) clearInterval(mcPolling);
    };
  }, [
    refetchInventory,
    refetchOrders,
    refetchQueueStatus,
    refetchMcStatus,
    isDemo,
  ]);

  const updateInventoryItem = useCallback(
    async (
      componentId: string,
      payload: {
        totalStock?: number;
        warningStock?: number;
        currentMagazineStock?: number;
        magazineCount?: number;
        magazineSize?: number;
        maxOrderQuantity?: number;
      }
    ) => {
      try {
        const response = await fetch(`${API_URL}/inventory/${componentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          cache: 'no-store',
          signal: abortSignalWithTimeout(10000),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const result = await response.json();
        inventoryCache = null;
        await refetchInventory(true);
        return result;
      } catch (err) {
        console.error('Failed to update inventory:', err);
        inventoryCache = null;
        await refetchInventory(true).catch(() => null);
        throw err;
      }
    },
    [refetchInventory]
  );

  const submitOrder = useCallback(
    async (items: Array<{ componentType: string; quantity: number }>) => {
      const response = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
        cache: 'no-store',
        signal: abortSignalWithTimeout(10000),
      });

      if (!response.ok) {
        let detail = response.statusText;
        try {
          const errBody = await response.json();
          const m = errBody?.message;
          if (typeof m === 'string') detail = m;
          else if (Array.isArray(m)) detail = m.join(' ');
        } catch {
          /* ignore */
        }
        throw new Error(
          response.status === 400
            ? detail
            : `HTTP ${response.status}: ${detail}`
        );
      }

      const result = await response.json();
      inventoryCache = null;
      ordersCache = null;
      await Promise.all([refetchInventory(true), refetchOrders(true)]);
      return result;
    },
    [refetchInventory, refetchOrders]
  );

  const cancelOrder = useCallback(
    async (orderId: string) => {
      const response = await fetch(`${API_URL}/orders/${orderId}/cancel`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      queueCache = null;
      ordersCache = null;
      inventoryCache = null;

      await Promise.all([
        refetchQueueStatus(true),
        refetchInventory(true),
        refetchOrders(true),
      ]);
    },
    [refetchInventory, refetchOrders, refetchQueueStatus]
  );

  const magazineReset = useCallback(
    async (orderId: string) => {
      const response = await fetch(
        `${API_URL}/orders/${orderId}/magazine-reset`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      queueCache = null;
      ordersCache = null;
      inventoryCache = null;

      await Promise.all([
        refetchQueueStatus(true),
        refetchInventory(true),
        refetchOrders(true),
      ]);
    },
    [refetchInventory, refetchOrders, refetchQueueStatus]
  );

  const standaloneMagazineChange = useCallback(async () => {
    const response = await fetch(
      `${API_URL}/orders/mc/standalone-magazine-change`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    queueCache = null;
    ordersCache = null;
    inventoryCache = null;

    await Promise.all([
      refetchQueueStatus(true),
      refetchInventory(true),
      refetchOrders(true),
    ]);
  }, [refetchInventory, refetchOrders, refetchQueueStatus]);

  const startMagazineChange = useCallback(async () => {
    const response = await fetch(`${API_URL}/orders/mc/magazine-change/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    queueCache = null;
    await Promise.all([refetchQueueStatus(true), refetchMcStatus(true)]);
  }, [refetchMcStatus, refetchQueueStatus]);

  const forceStartMagazineChange = useCallback(
    async (part: number) => {
      const response = await fetch(
        `${API_URL}/orders/mc/magazine-change/force`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ part }),
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      queueCache = null;
      await Promise.all([refetchQueueStatus(true), refetchMcStatus(true)]);
    },
    [refetchMcStatus, refetchQueueStatus]
  );

  const value: ApiContextType = {
    inventory: inventoryServer,
    orders,
    loadingInventory,
    loadingOrders,
    queueStatus,
    loadingQueueStatus,
    mcStatus,
    mcStatusData,
    mcConnected,
    componentsConfig,
    loadingComponentsConfig,
    errorInventory,
    errorOrders,
    refetchInventory,
    refetchOrders,
    updateInventoryItem,
    submitOrder,
    refetchQueueStatus,
    refetchMcStatus,
    cancelOrder,
    magazineReset,
    standaloneMagazineChange,
    startMagazineChange,
    forceStartMagazineChange,
  };

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi() {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error('useApi must be used within ApiProvider');
  }
  return context;
}
