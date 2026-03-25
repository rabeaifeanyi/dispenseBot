'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface Order {
  id: string;
  timestamp: string;
  status: string;
  queuePosition?: number;
  items?: Array<{
    componentId: string;
    quantity: number;
  }>;
}

let orderCache: Order[] | null = null;
let ordersFetch: Promise<Order[]> | null = null;
const cacheExpiry = 3000;
let lastOrdersFetchTime = 0;

export function useOrders(pollInterval: number | null = 5000) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  const fetchOrders = useCallback(async (forceRefresh = false) => {
    if (
      !forceRefresh &&
      orderCache &&
      Date.now() - lastOrdersFetchTime < cacheExpiry
    ) {
      if (isMountedRef.current) {
        setOrders(orderCache);
        setLoading(false);
      }
      return orderCache;
    }

    if (ordersFetch) {
      try {
        const data = await ordersFetch;
        if (isMountedRef.current) setOrders(data);
        return data;
      } catch (err) {
        if (isMountedRef.current) setError(String(err));
      }
    }

    if (isMountedRef.current) setLoading(true);

    ordersFetch = (async () => {
      try {
        const response = await fetch(`${API_URL}/orders`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const ordersArray = Array.isArray(data) ? data : Object.values(data);

        orderCache = ordersArray;
        lastOrdersFetchTime = Date.now();

        if (isMountedRef.current) {
          setOrders(ordersArray);
          setError(null);
        }
        return ordersArray;
      } catch (err) {
        const errorMsg = String(err);
        if (isMountedRef.current) {
          setError(errorMsg);
          console.error('Failed to fetch orders:', err);
        }
        throw err;
      } finally {
        ordersFetch = null;
        if (isMountedRef.current) setLoading(false);
      }
    })();

    return ordersFetch;
  }, []);

  useEffect(() => {
    if (pollInterval === null) return;

    fetchOrders();
    const setupPoll = () => {
      pollTimeoutRef.current = setTimeout(() => {
        fetchOrders(true);
        setupPoll();
      }, pollInterval);
    };

    setupPoll();

    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, [pollInterval, fetchOrders]);

  return { orders, loading, error, refetch: fetchOrders };
}
