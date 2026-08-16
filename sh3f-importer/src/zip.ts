const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

interface ZipEntry { readonly name: string; readonly method: number; readonly compressedSize: number; readonly uncompressedSize: number; readonly localOffset: number; }

function readU16(view: DataView, offset: number): number { return view.getUint16(offset, true); }
function readU32(view: DataView, offset: number): number { return view.getUint32(offset, true); }

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= start; i -= 1) {
    if (view.getUint32(i, true) === END_OF_CENTRAL_DIRECTORY) return i;
  }
  throw new Error('Invalid ZIP archive: end of central directory not found');
}

function readEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(bytes);
  const count = readU16(view, eocd + 10);
  let offset = readU32(view, eocd + 16);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (readU32(view, offset) !== CENTRAL_DIRECTORY_ENTRY) throw new Error(`Invalid ZIP archive: central directory entry ${index} is malformed`);
    const flags = readU16(view, offset + 8);
    const method = readU16(view, offset + 10);
    const compressedSize = readU32(view, offset + 20);
    const uncompressedSize = readU32(view, offset + 24);
    const nameLength = readU16(view, offset + 28);
    const extraLength = readU16(view, offset + 30);
    const commentLength = readU16(view, offset + 32);
    const localOffset = readU32(view, offset + 42);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    entries.push({ name: new TextDecoder((flags & 0x800) !== 0 ? 'utf-8' : 'iso-8859-1').decode(nameBytes), method, compressedSize, uncompressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('This runtime does not provide ZIP deflate decompression');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzip(bytes: Uint8Array): Promise<ReadonlyMap<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result = new Map<string, Uint8Array>();
  for (const entry of readEntries(bytes)) {
    if (readU32(view, entry.localOffset) !== LOCAL_FILE_HEADER) throw new Error(`Invalid ZIP archive: local header for "${entry.name}" is malformed`);
    const nameLength = readU16(view, entry.localOffset + 26);
    const extraLength = readU16(view, entry.localOffset + 28);
    const start = entry.localOffset + 30 + nameLength + extraLength;
    const compressed = bytes.subarray(start, start + entry.compressedSize);
    const content = entry.method === 0 ? new Uint8Array(compressed) : entry.method === 8 ? await inflateRaw(compressed) : (() => { throw new Error(`Unsupported ZIP compression method ${entry.method} for "${entry.name}"`); })();
    if (content.length !== entry.uncompressedSize) throw new Error(`Invalid ZIP entry "${entry.name}": size mismatch`);
    result.set(entry.name, content);
  }
  return result;
}
