import { reedSolomonEncode, reedSolomonDecode } from './galois';

export interface AssetConfig {
  width: number;
  height: number;
  padding: number;
  styleFlags: number;
  seed: number;
  payload: Uint8Array;
}

const RS_PARITY_BYTES = 16;
const HEADER_SIZE = 14; // Magic (2) + Version (1) + Width (2) + Height (2) + Padding (1) + Flags (2) + Seed (4)

/**
 * Encodes asset configuration into a compact Base64URL Universal Graph ID
 */
export function encodeGraphId(config: AssetConfig): string {
  const totalRawSize = HEADER_SIZE + config.payload.length;
  const rawBuffer = new Uint8Array(totalRawSize);
  const view = new DataView(rawBuffer.buffer);

  // Write Magic Header & Version
  rawBuffer[0] = 0x4F; // 'O'
  rawBuffer[1] = 0x4B; // 'K'
  rawBuffer[2] = 0x01; // Version 1

  // Write Dimensions & Layout
  view.setUint16(3, config.width, false);
  view.setUint16(5, config.height, false);
  rawBuffer[7] = config.padding;
  view.setUint16(8, config.styleFlags, false);
  view.setUint32(10, config.seed, false);

  // Copy Payload
  rawBuffer.set(config.payload, HEADER_SIZE);

  // Append Galois Field GF(2^8) Reed-Solomon Parity Symbols
  const parityBytes = reedSolomonEncode(rawBuffer, RS_PARITY_BYTES);
  
  const finalPacket = new Uint8Array(rawBuffer.length + parityBytes.length);
  finalPacket.set(rawBuffer, 0);
  finalPacket.set(parityBytes, rawBuffer.length);

  // Convert to URL-safe Base64
  return btoa(String.fromCharCode(...finalPacket))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decodes a Universal Graph ID back into asset configuration parameters
 */
export function decodeGraphId(graphId: string): AssetConfig {
  let base64 = graphId.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }

  const binaryString = atob(base64);
  const packet = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    packet[i] = binaryString.charCodeAt(i);
  }

  // Perform Reed-Solomon error correction validation over GF(2^8)
  const correctedPacket = reedSolomonDecode(packet, RS_PARITY_BYTES);
  const view = new DataView(correctedPacket.buffer);
  
  if (correctedPacket[0] !== 0x4F || correctedPacket[1] !== 0x4B) {
    throw new Error('Invalid asset graph ID: Magic header mismatch.');
  }

  const width = view.getUint16(3);
  const height = view.getUint16(5);
  const padding = correctedPacket[7] || 0;
  const styleFlags = view.getUint16(8);
  const seed = view.getUint32(10);
  
  const payload = correctedPacket.slice(HEADER_SIZE, correctedPacket.length - RS_PARITY_BYTES);

  return { width, height, padding, styleFlags, seed, payload };
}