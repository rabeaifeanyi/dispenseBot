export const DEFAULT_COMPONENT_ORDER = [
  'PART1',
  'PART2',
  'PART3',
  'PART4',
  'PART5',
] as const;

function partOrderIndex(
  type: string | undefined,
  order: readonly string[]
): number {
  if (!type) return 999;
  const i = order.indexOf(type);
  return i === -1 ? 999 : i;
}

export function sortByPartOrder<
  T extends { component?: { type?: string }; componentId?: string }
>(arr: T[], orderOverride?: readonly string[]): T[] {
  const order = orderOverride ?? DEFAULT_COMPONENT_ORDER;
  return [...arr].sort((a, b) => {
    const ai = partOrderIndex(a.component?.type, order);
    const bi = partOrderIndex(b.component?.type, order);
    if (ai !== bi) return ai - bi;
    return (a.componentId ?? '').localeCompare(b.componentId ?? '');
  });
}

export function sortOrderItemsByPart<
  T extends { component?: { type?: string } }
>(items: T[], orderOverride?: readonly string[]): T[] {
  const order = orderOverride ?? DEFAULT_COMPONENT_ORDER;
  return [...items].sort((a, b) => {
    const ai = partOrderIndex(a.component?.type, order);
    const bi = partOrderIndex(b.component?.type, order);
    return ai - bi;
  });
}

export function sortByComponentTypeOrder<T extends { type: string }>(
  arr: T[],
  orderOverride?: readonly string[]
): T[] {
  const order = orderOverride ?? DEFAULT_COMPONENT_ORDER;
  return [...arr].sort((a, b) => {
    const ai = order.indexOf(a.type);
    const bi = order.indexOf(b.type);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}
