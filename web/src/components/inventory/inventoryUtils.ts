import type { InventoryItem } from '@/contexts/ApiContext';

export function buildInventurInitialValues(inventory: InventoryItem[]): {
  loose: Record<string, number>;
  full: Record<string, number>;
} {
  const loose: Record<string, number> = {};
  const full: Record<string, number> = {};

  inventory.forEach((item) => {
    const magazineSize = item.magazineSize || 0;
    const inMachine = item.currentMagazineStock || 0;
    const spare = Math.max(0, (item.totalStock || 0) - inMachine);
    loose[item.componentId] =
      magazineSize > 0 ? spare % magazineSize : spare;
    full[item.componentId] = Math.max(0, (item.magazineCount ?? 1) - 1);
  });

  return { loose, full };
}
