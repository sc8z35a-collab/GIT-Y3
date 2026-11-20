/**
 * Automated Verification Suite for True 5K (5120×2880) High-Bitrate 48-Bit (16-Bit/ch) PNG Encoder!
 * Verifies:
 *  1. Exact PNG signature (89 50 4E 47 0D 0A 1A 0A)
 *  2. IHDR chunk: 5120×2880, bitDepth = 16 (48-bit RGB!), colorType = 2
 *  3. Strict IEEE CRC-32 integrity on EVERY chunk (IHDR, sRGB, gAMA, pHYs, tEXt, IDAT*, IEND)
 *  4. Full zlib inflate round-trip & Sub-filter reconstruction matching source 16-bit pixels 100% bit-exact!
 */

import { compute5KPhotoDimensions, crc32, encodeRgb16Png } from './PhotoCapture5K';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`  [FAIL] ${msg}`);
    throw new Error(`KHDR 1.1 5K Photo verification failed: ${msg}`);
  }
  console.log(`  [PASS] ${msg}`);
}

async function inflateZlibWeb(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const wDone = writer.write(copy).then(() => writer.close());
  const reader = ds.readable.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      parts.push(value);
      total += value.byteLength;
    }
  }
  await wDone;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

async function run(): Promise<void> {
  console.log('\n=== KHDR 1.1 × 5K High-Bitrate 48-Bit (16-Bit/ch) PNG Verification Suite ===\n');

  // 1. Dimension aspect preservation check
  const d169 = compute5KPhotoDimensions(1920, 1080);
  assert(d169.width === 5120 && d169.height === 2880, `16:9 5K dimensions exact: ${d169.width}×${d169.height}`);
  const dPort = compute5KPhotoDimensions(390, 844);
  assert(dPort.height === 5120 && dPort.width % 2 === 0, `Portrait mobile 5K dimensions exact: ${dPort.width}×${dPort.height}`);

  // 2. Bit-exact 16-bit/ch encode -> inflate -> un-filter round-trip verification (256×128 gradient)
  const tw = 256;
  const th = 128;
  const src16 = new Uint16Array(tw * th * 3);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const i = (y * tw + x) * 3;
      src16[i] = Math.round((x / (tw - 1)) * 65535);
      src16[i + 1] = Math.round((y / (th - 1)) * 65535);
      src16[i + 2] = ((x * 257 + y * 513) & 0xffff);
    }
  }

  const smallPng = await encodeRgb16Png(tw, th, src16, {
    Software: 'JANKEN KIWAMI 3D | KHDR 1.1',
  });

  // Verify PNG signature
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  assert(sig.every((b, idx) => smallPng[idx] === b), 'Valid 8-byte RFC 2083 PNG signature');

  // Parse all chunks, verify every CRC-32, collect IDAT payloads
  const view = new DataView(smallPng.buffer, smallPng.byteOffset, smallPng.byteLength);
  let pos = 8;
  const chunkTypes: string[] = [];
  const idats: Uint8Array[] = [];
  let parsedW = 0, parsedH = 0, parsedDepth = 0, parsedColor = 0;

  while (pos < smallPng.length) {
    const len = view.getUint32(pos, false);
    const type = String.fromCharCode(
      smallPng[pos + 4],
      smallPng[pos + 5],
      smallPng[pos + 6],
      smallPng[pos + 7]
    );
    const storedCrc = view.getUint32(pos + 8 + len, false);
    const calcCrc = crc32(smallPng, pos + 4, 4 + len);
    if (storedCrc !== calcCrc) {
      assert(false, `CRC-32 mismatch on chunk ${type}`);
    }
    chunkTypes.push(type);
    const payload = smallPng.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      const pv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      parsedW = pv.getUint32(0, false);
      parsedH = pv.getUint32(4, false);
      parsedDepth = payload[8];
      parsedColor = payload[9];
    } else if (type === 'IDAT') {
      idats.push(payload);
    }
    pos += 12 + len;
  }

  assert(
    parsedW === tw && parsedH === th && parsedDepth === 16 && parsedColor === 2,
    `IHDR verified: ${parsedW}×${parsedH}, bitDepth=${parsedDepth} (48-bit RGB), colorType=${parsedColor}`
  );
  assert(
    chunkTypes.includes('sRGB') && chunkTypes.includes('pHYs') && chunkTypes.includes('tEXt') && chunkTypes[chunkTypes.length - 1] === 'IEND',
    `All metadata & structural chunks CRC-32 verified: ${chunkTypes.join(' -> ')}`
  );

  // Concatenate IDAT & inflate using Web-Standard DecompressionStream('deflate')
  let idatTotal = 0;
  for (const c of idats) idatTotal += c.length;
  const idatAll = new Uint8Array(idatTotal);
  let off = 0;
  for (const c of idats) {
    idatAll.set(c, off);
    off += c.length;
  }
  const inflated = await inflateZlibWeb(idatAll);
  const stride = 1 + tw * 6;
  assert(inflated.length === th * stride, `Zlib inflate length exact (${inflated.length} bytes)`);

  // Reconstruct PNG Sub-filter (bpp=6) and verify 100% bit-exact 16-bit pixel equality!
  let mismatches = 0;
  const rowBuf = new Uint8Array(tw * 6);
  for (let y = 0; y < th; y++) {
    const fType = inflated[y * stride];
    if (fType !== 1) mismatches++;
    for (let i = 0; i < tw * 6; i++) {
      const left = i >= 6 ? rowBuf[i - 6] : 0;
      rowBuf[i] = (inflated[y * stride + 1 + i] + left) & 0xff;
    }
    for (let x = 0; x < tw; x++) {
      const idx = (y * tw + x) * 3;
      const r = (rowBuf[x * 6] << 8) | rowBuf[x * 6 + 1];
      const g = (rowBuf[x * 6 + 2] << 8) | rowBuf[x * 6 + 3];
      const b = (rowBuf[x * 6 + 4] << 8) | rowBuf[x * 6 + 5];
      if (r !== src16[idx] || g !== src16[idx + 1] || b !== src16[idx + 2]) mismatches++;
    }
  }
  assert(mismatches === 0, `100% bit-exact 16-bit/ch (65,536 tonal levels) round-trip reconstruction (0 mismatches)`);

  // 3. Full True 5K (5120×2880, 14.75 MP, 48-bit) stress benchmark!
  const t0 = performance.now();
  const full5kPixels = new Uint16Array(5120 * 2880 * 3);
  for (let y = 0; y < 2880; y++) {
    const gVal = Math.round((y / 2879) * 65535);
    const row = y * 5120 * 3;
    for (let x = 0; x < 5120; x++) {
      const p = row + x * 3;
      full5kPixels[p] = (x * 12) & 0xffff;
      full5kPixels[p + 1] = gVal;
      full5kPixels[p + 2] = ((x + y) * 9) & 0xffff;
    }
  }
  const png5k = await encodeRgb16Png(5120, 2880, full5kPixels, {
    Title: 'JANKEN KIWAMI 3D — 5K KHDR 1.1',
  });
  const ms5k = Math.round(performance.now() - t0);
  const v5k = new DataView(png5k.buffer, png5k.byteOffset, png5k.byteLength);
  assert(
    v5k.getUint32(16, false) === 5120 && v5k.getUint32(20, false) === 2880 && png5k[24] === 16,
    `Full 5K (5120×2880, 14.75MP, 48-bit) lossless PNG encoded in ${ms5k}ms (${(png5k.byteLength / (1024 * 1024)).toFixed(2)} MB)`
  );

  console.log('\nKHDR 1.1 × 5K 48-Bit PNG Verification Complete — ALL CHECKS PASSED.\n');
}

void run();
