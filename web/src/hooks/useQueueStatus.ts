'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface QueueStatus {
  position: number;
  status: string;
  estimatedTime?: number;
}

export function useQueueStatus(
  orderId: string | null,
  pollInterval: number | null = 5000
) {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(orderId ? true : false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  const fetchQueueStatus = useCallback(async () => {
    if (!orderId) return;

    if (isMountedRef.current) setLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/queue/status?orderId=${orderId}`,
        {
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (isMountedRef.current) {
        setStatus(data);
        setError(null);
      }
    } catch (err) {
      const errorMsg = String(err);
      if (isMountedRef.current) {
        setError(errorMsg);
        console.error('Failed to fetch queue status:', err);
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [orderId]);

  // Setup polling
  useEffect(() => {
    if (!orderId || pollInterval === null) return;

    fetchQueueStatus();
    const setupPoll = () => {
      pollTimeoutRef.current = setTimeout(() => {
        fetchQueueStatus();
        setupPoll();
      }, pollInterval);
    };

    setupPoll();

    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, [orderId, pollInterval, fetchQueueStatus]);

  return { status, loading, error, refetch: fetchQueueStatus };
}
