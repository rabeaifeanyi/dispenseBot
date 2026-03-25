import * as fs from 'fs';
import * as path from 'path';

export type HexString = `#${string}`;

export type ComponentsConfigPart = {
  displayName: string;
  magazineLabel: string;
  tint: { base: HexString; overlay: HexString };
  images: { fileBase: string };
  mc: {
    wertIndex: number;
    antwortIndex: number;
    magazinIndex: number;
  };
};

export type ComponentsConfig = {
  version: number;
  order?: string[];
  parts: Record<string, ComponentsConfigPart>;
  meta?: {
    filePath?: string;
    mtimeMs?: number;
    sizeBytes?: number;
  };
};

let cached: ComponentsConfig | null = null;
let cachedMtimeMs: number | null = null;
let cachedSizeBytes: number | null = null;

function resolveConfigPath() {
  const byCwd = path.resolve(process.cwd(), 'config.json');
  if (fs.existsSync(byCwd)) return byCwd;

  const byHere = path.resolve(__dirname, '../../../config.json');
  if (fs.existsSync(byHere)) return byHere;

  return byCwd;
}

export function getComponentsConfig(): ComponentsConfig {
  try {
    const filePath = resolveConfigPath();
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    const mtimeMs = stat?.mtimeMs ?? null;
    const sizeBytes = stat?.size ?? null;

    if (
      cached &&
      cachedMtimeMs !== null &&
      mtimeMs !== null &&
      cachedSizeBytes !== null &&
      sizeBytes !== null
    ) {
      if (cachedMtimeMs === mtimeMs && cachedSizeBytes === sizeBytes) {
        return cached;
      }
    }

    if (!fs.existsSync(filePath)) {
      if (cached) return cached;
      throw new Error(
        `config.json not found at: ${filePath} (resolved from ${process.cwd()})`
      );
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as ComponentsConfig;

    const hasParts =
      parsed?.parts &&
      typeof parsed.version === 'number' &&
      typeof parsed.parts === 'object' &&
      Object.keys(parsed.parts).length > 0;

    const allPartsValid =
      hasParts &&
      Object.values(parsed.parts).every(
        (p: any) =>
          typeof p?.displayName === 'string' &&
          typeof p?.mc?.wertIndex === 'number' &&
          typeof p?.mc?.antwortIndex === 'number' &&
          typeof p?.mc?.magazinIndex === 'number'
      );

    if (!hasParts || !allPartsValid) {
      if (cached) return cached;
      throw new Error(
        'Invalid config.json: must have version, and at least one part with displayName and mc.wertIndex/antwortIndex/magazinIndex.'
      );
    }

    cached = {
      ...parsed,
      meta: {
        filePath,
        mtimeMs: mtimeMs ?? undefined,
        sizeBytes: sizeBytes ?? undefined,
      },
    };
    cachedMtimeMs = mtimeMs;
    cachedSizeBytes = sizeBytes;
    return cached;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}
