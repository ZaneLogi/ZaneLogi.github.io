// Dependency-free zip reader. Parses the zip central directory + local headers
// and inflates entries with the browser's built-in DecompressionStream
// ('deflate-raw' — Baseline since 2023). Handles STORED (method 0) and DEFLATE
// (method 8); no zip64, no encryption — enough for U6/U7 data zips. Sizes are read
// from the CENTRAL directory (authoritative even for data-descriptor entries);
// the data offset is read from each entry's LOCAL header. CRC is not verified.

const EOCD_SIG = 0x06054b50; // End Of Central Directory
const CDFH_SIG = 0x02014b50; // Central Directory File Header
const LFH_SIG  = 0x04034b50; // Local File Header

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function findEOCD(view, len) {
  // EOCD = 22 bytes + an optional comment (<= 65535). Scan backward for its signature.
  const minPos = Math.max(0, len - 22 - 0xffff);
  for (let p = len - 22; p >= minPos; p--) {
    if (view.getUint32(p, true) === EOCD_SIG) return p;
  }
  throw new Error('not a zip file (no End Of Central Directory record)');
}

// Returns an array of { name, bytes } — one per file entry (directories skipped).
// `name` is the entry's path inside the zip; callers take the basename if needed.
export async function unzip(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = bytes.byteLength;

  const eocd = findEOCD(view, len);
  const entryCount = view.getUint16(eocd + 10, true);
  let cd = view.getUint32(eocd + 16, true);

  const out = [];
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(cd, true) !== CDFH_SIG) throw new Error('bad central directory header');
    const method   = view.getUint16(cd + 10, true);
    const compSize = view.getUint32(cd + 20, true);
    const nameLen  = view.getUint16(cd + 28, true);
    const extraLen = view.getUint16(cd + 30, true);
    const cmtLen   = view.getUint16(cd + 32, true);
    const localOff = view.getUint32(cd + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(cd + 46, cd + 46 + nameLen));
    cd += 46 + nameLen + extraLen + cmtLen;

    if (name.endsWith('/')) continue; // directory entry

    // The local header's extra-field length can differ from the central one, so
    // read the data offset from the local header.
    if (view.getUint32(localOff, true) !== LFH_SIG) throw new Error('bad local file header for ' + name);
    const lNameLen  = view.getUint16(localOff + 26, true);
    const lExtraLen = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const comp = bytes.subarray(dataStart, dataStart + compSize);

    let fileBytes;
    if (method === 0) fileBytes = comp.slice();                 // STORED
    else if (method === 8) fileBytes = await inflateRaw(comp);  // DEFLATE
    else throw new Error(`unsupported zip compression method ${method} for ${name}`);

    out.push({ name, bytes: fileBytes });
  }
  return out;
}
