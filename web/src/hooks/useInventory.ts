'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

let inventoryCache: InventoryItem[] | null = null;
let inventoryFetch: Promise<InventoryItem[]> | null = null;
const cacheExpiry = 5000;
let lastFetchTime = 0;

export function useInventory(autoFetch = true) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(!autoFetch ? false : true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchInventory = useCallback(async (forceRefresh = false) => {
    if (
      !forceRefresh &&
      inventoryCache &&
      Date.now() - lastFetchTime < cacheExpiry
    ) {
      if (isMountedRef.current) {
        setInventory(inventoryCache);
        setLoading(false);
      }
      return inventoryCache;
    }

    if (inventoryFetch) {
      try {
        const data = await inventoryFetch;
        if (isMountedRef.current) setInventory(data);
        return data;
      } catch (err) {
        if (isMountedRef.current) setError(String(err));
      }
    }

    if (isMountedRef.current) setLoading(true);

    inventoryFetch = (async () => {
      try {
        const response = await fetch(`${API_URL}/inventory`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const inventoryArray = Array.isArray(data) ? data : Object.values(data);

        inventoryCache = inventoryArray;
        lastFetchTime = Date.now();

        if (isMountedRef.current) {
          setInventory(inventoryArray);
          setError(null);
        }
        return inventoryArray;
      } catch (err) {
        const errorMsg = String(err);
        if (isMountedRef.current) {
          setError(errorMsg);
          console.error('Failed to fetch inventory:', err);
        }
        throw err;
      } finally {
        inventoryFetch = null;
        if (isMountedRef.current) setLoading(false);
      }
    })();

    return inventoryFetch;
  }, []);

  useEffect(() => {
    if (autoFetch) {
      fetchInventory();
    }
  }, [autoFetch, fetchInventory]);

  return { inventory, loading, error, refetch: fetchInventory };
}
