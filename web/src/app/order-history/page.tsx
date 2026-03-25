'use client';

import OrderList from '@/components/OrderList';
import { useEffect } from 'react';
import { useApi } from '@/contexts/ApiContext';

export default function OrderHistoryPage() {
  const { refetchOrders } = useApi();

  useEffect(() => {
    void refetchOrders(true);
  }, [refetchOrders]);

  return <OrderList />;
}
