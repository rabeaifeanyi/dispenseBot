import type { InventoryItem } from '@/contexts/ApiContext';

export type OrderFormInventoryRow = {
  type: string;
  name: string;
  currentMagazineStock: number;
  magazineSize: number;
  maxOrderQuantity: number;
  warningStock?: number;
  magazineCount?: number;
  totalStock?: number;
};

export function inventoryItemToOrderFormRow(
  item: InventoryItem
): OrderFormInventoryRow {
  return {
    type: item.component.type,
    name: item.component.name,
    currentMagazineStock: item.currentMagazineStock,
    magazineSize: item.magazineSize,
    maxOrderQuantity: item.maxOrderQuantity,
    warningStock: item.warningStock,
    magazineCount: item.magazineCount,
    totalStock: item.totalStock,
  };
}
