import { unzip } from './zip.js';
import type { Sh3fAsset, Sh3fImporterOptions, Sh3fLibrary } from './types.js';

const CATALOG = 'PluginFurnitureCatalog';

function unescape(value: string): string {
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))).replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\\f/g, '\f').replace(/\\([\\:=#! ])/g, '$1');
}

function properties(bytes: Uint8Array): Map<string, string> {
  const lines = new TextDecoder('iso-8859-1').decode(bytes).replace(/\r\n?/g, '\n').split('\n');
  const result = new Map<string, string>();
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i] ?? '';
    while (/\\$/.test(line)) line = line.slice(0, -1) + (lines[++i] ?? '');
    line = line.trimStart();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const match = line.match(/^([^:=\s]+)[\s:=]+(.*)$/);
    result.set(unescape(match?.[1] ?? line), unescape(match?.[2] ?? ''));
  }
  return result;
}

function catalog(entries: ReadonlyMap<string, Uint8Array>, locale?: string): Map<string, string> {
  const candidates = locale ? [`${CATALOG}_${locale}.properties`, `${CATALOG}_${locale.split('-')[0]}.properties`, `${CATALOG}.properties`] : [`${CATALOG}.properties`];
  for (const name of candidates) {
    const data = entries.get(name);
    if (data) return properties(data);
  }
  throw new Error(`SH3F archive does not contain ${CATALOG}.properties`);
}

const text = (p: Map<string, string>, key: string): string | undefined => p.get(key) || undefined;
const num = (p: Map<string, string>, key: string): number => { const n = Number(p.get(key)); return Number.isFinite(n) ? n : 0; };
const bool = (p: Map<string, string>, key: string, fallback: boolean): boolean => p.has(key) ? p.get(key)?.toLowerCase() === 'true' : fallback;
const nums = (p: Map<string, string>, key: string): number[] | undefined => { const value = p.get(key); if (!value) return undefined; const result = value.trim().split(/\s+/).map(Number); return result.every(Number.isFinite) ? result : undefined; };

export async function parseSh3f(data: ArrayBuffer | Uint8Array, options: Sh3fImporterOptions = {}): Promise<Sh3fLibrary> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const entries = await unzip(bytes);
  const base = catalog(entries, options.locale);
  const assets: Sh3fAsset[] = [];
  for (let index = 1; ; index += 1) {
    const name = base.get(`name#${index}`);
    if (name === undefined) break;
    const model = base.get(`model#${index}`);
    const category = base.get(`category#${index}`);
    if (!model || !category) throw new Error(`Invalid SH3F catalog: furniture #${index} requires name, category and model`);
    assets.push({ index, id: text(base, `id#${index}`), name, description: text(base, `description#${index}`), information: text(base, `information#${index}`), tags: (base.get(`tags#${index}`) ?? '').split(',').map((tag) => tag.trim()).filter(Boolean), category, model, icon: text(base, `icon#${index}`), planIcon: text(base, `planIcon#${index}`), widthCm: num(base, `width#${index}`), depthCm: num(base, `depth#${index}`), heightCm: num(base, `height#${index}`), elevationCm: num(base, `elevation#${index}`), movable: bool(base, `movable#${index}`, true), doorOrWindow: bool(base, `doorOrWindow#${index}`, false), multiPartModel: bool(base, `multiPartModel#${index}`, false), resizable: bool(base, `resizable#${index}`, true), deformable: bool(base, `deformable#${index}`, true), texturable: bool(base, `texturable#${index}`, true), creator: text(base, `creator#${index}`), modelRotation: nums(base, `modelRotation#${index}`) });
  }
  return { id: text(base, 'id'), name: text(base, 'name'), description: text(base, 'description'), version: text(base, 'version'), license: text(base, 'license'), provider: text(base, 'provider'), assets, entries };
}
