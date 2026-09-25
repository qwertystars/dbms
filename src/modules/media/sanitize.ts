// Removes metadata (EXIF, GPS, XMP, comments) from uploaded images without
// re-encoding them, because Workers has no image codec. The browser client also
// re-encodes photos through a canvas before upload, which applies EXIF
// orientation first; this pass protects against clients that skip that step.

export type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export function sniffImageType(bytes: Uint8Array): ImageMime | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  ) {
    return "image/png";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) {
    return "image/gif";
  }
  return undefined;
}

export function stripImageMetadata(bytes: Uint8Array, type: ImageMime): Uint8Array {
  switch (type) {
    case "image/jpeg":
      return stripJpeg(bytes);
    case "image/png":
      return stripPng(bytes);
    case "image/webp":
      return stripWebp(bytes);
    case "image/gif":
      return bytes;
  }
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// JPEG: keep APP0 (JFIF), APP2 (ICC colour profile) and APP14 (Adobe colour
// transform); drop APP1 (EXIF, XMP), the other APPn segments and comments.
function stripJpeg(bytes: Uint8Array): Uint8Array {
  const keptApp = new Set([0xe0, 0xe2, 0xee]);
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let pos = 2;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) throw new Error("Malformed JPEG");
    const marker = bytes[pos + 1];
    if (marker === 0xff) {
      pos++;
      continue;
    }
    if (marker === 0xda) {
      // Start of scan: the compressed image data runs to the end of the file.
      parts.push(bytes.subarray(pos));
      return concat(parts);
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(bytes.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }
    const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
    const end = pos + 2 + length;
    if (length < 2 || end > bytes.length) throw new Error("Malformed JPEG");
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const drop = (isApp && !keptApp.has(marker)) || marker === 0xfe;
    if (!drop) parts.push(bytes.subarray(pos, end));
    pos = end;
  }
  throw new Error("Malformed JPEG");
}

// PNG: drop text, timestamp and EXIF chunks. Other chunks keep their CRCs.
function stripPng(bytes: Uint8Array): Uint8Array {
  const dropped = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const length = view.getUint32(pos);
    const type = ascii(bytes, pos + 4, 4);
    const end = pos + 12 + length;
    if (end > bytes.length) throw new Error("Malformed PNG");
    if (!dropped.has(type)) parts.push(bytes.subarray(pos, end));
    pos = end;
    if (type === "IEND") return concat(parts);
  }
  throw new Error("Malformed PNG");
}

// WebP: drop the EXIF and XMP chunks, clear their VP8X flags and fix the RIFF size.
function stripWebp(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Uint8Array[] = [];
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const type = ascii(bytes, pos, 4);
    const size = view.getUint32(pos + 4, true);
    const end = pos + 8 + size + (size % 2);
    if (pos + 8 + size > bytes.length) throw new Error("Malformed WebP");
    if (type !== "EXIF" && type !== "XMP ") {
      const chunk = bytes.slice(pos, Math.min(end, bytes.length));
      if (type === "VP8X" && chunk.length > 8) chunk[8] &= ~(0x08 | 0x04);
      chunks.push(chunk);
    }
    pos = end;
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 12));
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  return concat([header, body]);
}
