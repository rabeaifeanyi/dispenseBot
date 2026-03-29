import type { InventoryItem } from '@/contexts/ApiContext';

export type StockLevelStatus = 'good' | 'warning' | 'critical';

export function getStockLevelStatus(
  item: Pick<InventoryItem, 'totalStock' | 'warningStock'>
): StockLevelStatus {
  if (item.totalStock <= item.warningStock / 2) return 'critical';
  if (item.totalStock <= item.warningStock) return 'warning';
  return 'good';
}
