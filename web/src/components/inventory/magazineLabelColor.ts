import type { ComponentsConfig } from '@/contexts/ApiContext';

export function getMagazineLabelColor(
  type: string,
  componentsConfig: ComponentsConfig | null
): string {
  const tint = componentsConfig?.parts?.[type]?.tint;
  if (!tint) return '#666';

  const isWhiteBackground =
    tint.base.toLowerCase() === '#ffffff' &&
    tint.overlay.toLowerCase() === '#ffffff';

  return isWhiteBackground ? '#666' : tint.overlay;
}
