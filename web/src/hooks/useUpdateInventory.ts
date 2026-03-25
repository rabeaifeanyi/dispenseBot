'use client';

import { useState, useCallback, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface UpdateInventoryPayload {
  totalStock?: number;
  warningStock?: number;
}

export function useUpdateInventory() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const updateInventory = useCallback(
    async (componentId: string, payload: UpdateInventoryPayload) => {
      if (isMountedRef.current) {
        setLoading(true);
        setError(null);
      }

      try {
        const response = await fetch(`${API_URL}/inventory/${componentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        if (isMountedRef.current) setError(null);
        return result;
      } catch (err) {
        const errorMsg = String(err);
        if (isMountedRef.current) {
          setError(errorMsg);
          console.error('Failed to update inventory:', err);
        }
        throw err;
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    },
    []
  );

  return { updateInventory, loading, error };
}
