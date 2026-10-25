/**
 * Packs a binary byte array into 3-byte RGB pixel triplets (Red, Green, Blue)
 * with Alpha pinned strictly to 255 to eliminate premultiplied alpha-blending artifacts.
 */
export function bytesToRgbPixels(bytes: Uint8Array): Uint8ClampedArray {
  // Each pixel needs 4 channels (RGBA). 3 bytes map to R, G, B.
  const numPixels = Math.ceil(bytes.length / 3);
  const pixelData = new Uint8ClampedArray(numPixels * 4);

  for (let i = 0; i < numPixels; i++) {
    const byteIdx = i * 3;
    const pixelIdx = i * 4;

    pixelData[pixelIdx]     = bytes[byteIdx]     ?? 0; // Red
    pixelData[pixelIdx + 1] = bytes[byteIdx + 1] ?? 0; // Green
    pixelData[pixelIdx + 2] = bytes[byteIdx + 2] ?? 0; // Blue
    pixelData[pixelIdx + 3] = 255;                     // Alpha (Strictly opaque)
  }

  return pixelData;
}

/**
 * Extracts raw byte streams back out from an HTML5 Canvas pixel image data buffer.
 */
export function rgbPixelsToBytes(pixelData: Uint8ClampedArray, originalByteLength: number): Uint8Array {
  const bytes = new Uint8Array(originalByteLength);
  let byteCount = 0;

  for (let i = 0; i < pixelData.length && byteCount < originalByteLength; i += 4) {
    if (byteCount < originalByteLength) bytes[byteCount++] = pixelData[i];     // Red
    if (byteCount < originalByteLength) bytes[byteCount++] = pixelData[i + 1]; // Green
    if (byteCount < originalByteLength) bytes[byteCount++] = pixelData[i + 2]; // Blue
  }

  return bytes;
}