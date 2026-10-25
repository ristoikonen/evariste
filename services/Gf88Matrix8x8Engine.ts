/**
 * Galois Field GF(2^8) 8x8 Matrix Identity & Transform Engine
 * Pure TypeScript / Bun (No UI) - Encrypt / Decrypt 8-byte blocks.
 */

export class GaloisField28 {
  private static readonly PRIMITIVE_POLYNOMIAL = 0x11d; // x^8 + x^4 + x^3 + x^2 + 1
  private static expTable: Uint8Array = new Uint8Array(512);
  private static logTable: Uint8Array = new Uint8Array(256);
  private static initialized = false;

  public static init(): void {
    if (this.initialized) return;
    let x = 1;
    for (let i = 0; i < 255; i++) {
      this.expTable[i] = x;
      this.logTable[x] = i;
      x <<= 1;
      if (x & 0x100) {
        x ^= this.PRIMITIVE_POLYNOMIAL;
      }
    }
    for (let i = 255; i < 512; i++) {
      this.expTable[i] = this.expTable[i - 255]  || 0;
    }
    this.logTable[0] = 0;
    this.initialized = true;
  }

  public static add(a: number, b: number): number {
    return a ^ b;
  }

  public static mul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    this.init();
    return this.expTable[this.logTable[a] || 0 + (this.logTable[b] || 0)] || 0;
  }

  public static div(a: number, b: number): number {
    if (b === 0) throw new Error("Division by zero in GF(2^8)");
    if (a === 0) return 0;
    this.init();
    const logDiff = (this.logTable[a] || 0) - (this.logTable[b]  || 0) + 255;
    return (this.expTable[logDiff]  || 0);
  }

  public static inverse(a: number): number {
    if (a === 0) throw new Error("Inverse of zero");
    this.init();
    return this.expTable[255 - (this.logTable[a] || 0)] || 0;
  }
}

/**
 * 8x8 Matrix Transform Engine over GF(2^8)
 */
export class Gf28Matrix8x8Engine {
  private matrix: number[][];
  private inverseMatrix: number[][];

  constructor(matrix: number[][]) {
    GaloisField28.init();
    if (matrix.length !== 8 || matrix.some(row => row.length !== 8)) {
      throw new Error("Matrix must be exactly 8x8");
    }
    this.matrix = matrix.map(row => [...row]);
    this.inverseMatrix = this.invertMatrix(this.matrix);
  }

  /**
   * Multiply 8-byte block by 8x8 matrix over GF(2^8)
   */
  public enc(block: Uint8Array): Uint8Array {
    if (block.length !== 8) {
      throw new Error("Block must be exactly 8 bytes");
    }
    const result = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      let sum = 0;
      for (let j = 0; j < 8; j++) {
        sum = GaloisField28.add(sum, GaloisField28.mul((this.matrix[i]?.[j] || 0), block[j] || 0) || 0);
      }
      result[i] = sum;
    }
    return result;
  }

  /**
   * Decrypt/Inverse transform 8-byte block using the inverse 8x8 matrix over GF(2^8)
   */
  public dec(block: Uint8Array): Uint8Array {
    if (block.length !== 8) {
      throw new Error("Block must be exactly 8 bytes");
    }
    const result = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      let sum = 0;
      for (let j = 0; j < 8; j++) {
        sum = GaloisField28.add(sum, GaloisField28.mul(this.inverseMatrix[i]?.[j] || 0, block[j] || 0));
      }
      result[i] = sum;
    }
    return result;
  }

  /**
   * Computes the inverse of an 8x8 matrix over GF(2^8) using Gauss-Jordan elimination
   */
  private invertMatrix(mat: number[][]): number[][] {
    const n = 8;
    // Augment matrix with identity matrix
    const aug: number[][] = Array.from({ length: n }, (_, i) => {
      const row = new Array(2 * n).fill(0);
      for (let j = 0; j < n; j++) {
        row[j] = mat[i]?.[j];
      }
      row[i + n] = 1;
      return row;
    });

    for (let i = 0; i < n; i++) {
      // Find pivot
      let pivot = i;
      while (pivot < n && aug[pivot]?.[i] === 0) {
        pivot++;
      }
      if (pivot === n) {
        throw new Error("Matrix is singular and cannot be inverted in GF(2^8)");
      }

      // Swap rows
      if (pivot !== i) {
        [aug[i]!, aug[pivot]!] = [aug[pivot]!, aug[i]!];
      }

      // Normalize pivot row
      const invPivot = GaloisField28.inverse(aug[i]?.[i] || 0);
      for (let j = 0; j < 2 * n; j++) {
        aug[i]![j]  = GaloisField28.mul(aug[i]?.[j] || 0, invPivot);
      }

      // Eliminate column
      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = aug[k]?.[i];
          if (factor !== 0) {
            for (let j = 0; j < 2 * n; j++) {
              aug[k]![j] = GaloisField28.add((aug[k]?.[j] || 0), GaloisField28.mul(factor || 0, (aug[i]?.[j] || 0)));
            }
          }
        }
      }
    }

    // Extract inverse matrix from right half of augmented matrix
    const inv: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        inv[i]![j] = aug[i]![j + n] ?? 0;
      }
    }
    return inv;
  }
}

const SECRET_MATRIX: number[][] = [
  [1, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 1],
];

const engine = new Gf28Matrix8x8Engine(SECRET_MATRIX);

export function processPixelArray(pixelBuffer: Buffer, mode: "enc" | "dec"): Buffer {
  const len = pixelBuffer.length;
  const remainder = len % 8;
  const paddingLength = remainder === 0 ? 0 : 8 - remainder;
  const totalLength = len + paddingLength;

  const paddedBuffer = Buffer.alloc(totalLength);
  pixelBuffer.copy(paddedBuffer);

  const outputBuffer = Buffer.alloc(totalLength);

  for (let offset = 0; offset < totalLength; offset += 8) {
    const block = new Uint8Array(paddedBuffer.buffer, paddedBuffer.byteOffset + offset, 8);
    const transformedBlock = mode === "enc" ? engine.enc(block) : engine.dec(block);
    Buffer.from(transformedBlock.buffer, transformedBlock.byteOffset, 8).copy(outputBuffer, offset);
  }

  return outputBuffer.subarray(0, len);
}



//import { GaloisField28 } from './Gf28Matrix8x8Engine'; // or your shared GF(2^8) module

export interface LbcStegOptions {
  blockLength?: number;   // n (default 255)
  messageLength?: number; // k (default 223)
}

/**
 * LbcGf28Stegano.ts
 * Linear Block Code (LBC) with GF(2^8) Arithmetic Steganographic Class
 * USAGE:
 * import { LbcGf28Stegano } from "./LbcGf28Stegano";

// 1. Initialize the steganographic engine (using default Reed-Solomon parameters: n=255, k=223)
const steg = new LbcGf28Stegano();

// 2. Prepare a secret payload (e.g., your 14-byte Universal ID or custom metadata bytes)
const payloadString = "YXNkAAAAAAAAAgAgAgE";
const payloadBytes = new TextEncoder().encode(payloadString);
console.log(`Original Payload (${payloadBytes.length} bytes):`, payloadString);

// 3. Prepare a carrier byte array (e.g., raw pixel buffer or binary container)
// LBC needs enough carrier space for the encoded blocks (n bytes per block)
const carrierSize = 512; // Must be >= required encoded length
const carrierBytes = new Uint8Array(carrierSize);
// Fill carrier with some dummy background data (like an image gradient or zeroes)
for (let i = 0; i < carrierSize; i++) {
  carrierBytes[i] = i % 256;
}

// 4. Embed the payload into the carrier
const infectedCarrier = steg.embed(payloadBytes, carrierBytes);
console.log(`Successfully embedded payload into carrier of size ${infectedCarrier.length} bytes.`);

// 5. Extract the payload back out from the carrier
const extractedBytes = steg.extract(infectedCarrier);
const recoveredString = new TextDecoder().decode(extractedBytes);

console.log(`Recovered Payload:`, recoveredString);
 */
export class LbcGf28Stegano {
  private n: number;
  private k: number;

  constructor(options: LbcStegOptions = {}) {
    GaloisField28.init();
    this.n = options.blockLength ?? 255;
    this.k = options.messageLength ?? 223;
  }

  private getGeneratorPolynomial(): Uint8Array {
    const degree = this.n - this.k;
    let g = new Uint8Array([1]);

    for (let i = 0; i < degree; i++) {
      const nextG = new Uint8Array(g.length + 1);
      // Generate primitive roots using 2^i in GF(2^8)
      const alpha_i = GaloisField28.mul(2, i); // or power-based generator
      
      for (let j = 0; j < g.length; j++) {
        nextG[j] = GaloisField28.add(nextG[j] || 0, g[j] || 0);
        nextG[j + 1] = GaloisField28.add(nextG[j + 1]|| 0, GaloisField28.mul(g[j] || 0, alpha_i));
      }
      g = nextG;
    }
    return g;
  }

  public encodeBlock(message: Uint8Array): Uint8Array {
    if (message.length > this.k) {
      throw new Error(`Message length ${message.length} exceeds capacity ${this.k}`);
    }

    const codeword = new Uint8Array(this.n);
    const generator = this.getGeneratorPolynomial();
    const temp = new Uint8Array(this.n);
    temp.set(message, 0);

    for (let i = 0; i < this.k; i++) {
      const coef = temp[i];
      if (coef !== 0) {
        for (let j = 0; j < generator.length; j++) {
          temp[i + j] = GaloisField28.add(temp[i + j]|| 0, GaloisField28.mul(generator[j]|| 0, coef|| 0));
        }
      }
    }

    codeword.set(message, 0);
    codeword.set(temp.subarray(this.k, this.n), this.k);
    return codeword;
  }

  public embed(payload: Uint8Array, carrier: Uint8Array): Uint8Array {
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, payload.length, false);

    const fullData = new Uint8Array(header.length + payload.length);
    fullData.set(header, 0);
    fullData.set(payload, header.length);

    const numBlocks = Math.ceil(fullData.length / this.k);
    const encodedTotalLength = numBlocks * this.n;

    if (carrier.length < encodedTotalLength) {
      throw new Error(`Carrier too small: need ${encodedTotalLength} bytes, got ${carrier.length}`);
    }

    const outputCarrier = new Uint8Array(carrier);
    let dataOffset = 0;
    let carrierOffset = 0;

    for (let b = 0; b < numBlocks; b++) {
      const chunk = new Uint8Array(this.k);
      const remaining = fullData.length - dataOffset;
      const chunkSize = Math.min(this.k, remaining);
      chunk.set(fullData.subarray(dataOffset, dataOffset + chunkSize), 0);
      dataOffset += chunkSize;

      const codeword = this.encodeBlock(chunk);

      for (let i = 0; i < this.n; i++) {
        const cByte = outputCarrier[carrierOffset + i];
        outputCarrier[carrierOffset + i] = GaloisField28.add((cByte|| 0) & 0xf0, (codeword[i] || 0) >> 4);
      }
      carrierOffset += this.n;
    }

    return outputCarrier;
  }

  public extract(carrier: Uint8Array): Uint8Array {
    const numBlocks = Math.floor(carrier.length / this.n);
    const extractedBytes = new Uint8Array(numBlocks * this.k);
    let extOffset = 0;
    let carrierOffset = 0;

    for (let b = 0; b < numBlocks; b++) {
      const codeword = new Uint8Array(this.n);
      for (let i = 0; i < this.n; i++) {
        const cByte = carrier[carrierOffset + i];
        codeword[i] = ((cByte || 0) & 0x0f) << 4;
      }
      extractedBytes.set(codeword.subarray(0, this.k), extOffset);
      extOffset += this.k;
      carrierOffset += this.n;
    }

    const payloadLength = new DataView(extractedBytes.buffer).getUint32(0, false);
    if (payloadLength > extractedBytes.length - 4) {
      throw new Error("Invalid payload length or corrupted steganographic carrier.");
    }

    return extractedBytes.subarray(4, 4 + payloadLength);
  }
}


//gf28ColorStegano.ts

export class Gf28ColorStegano {
  constructor() {
    GaloisField28.init();
  }

  /**
   * Stores a string of characters into an array of background color channels 
   * using GF(2^8) color channel multiplication/blending.
   */
  public static encodeTextToColors(text: string, baseColors: Uint8Array): Uint8Array {
    const textBytes = new TextEncoder().encode(text);
    
    if (baseColors.length < textBytes.length) {
      throw new Error(`Base color array too small: need ${textBytes.length} bytes, got ${baseColors.length}`);
    }

    const blendedColors = new Uint8Array(baseColors.length);

    for (let i = 0; i < baseColors.length; i++) {
      blendedColors.set(baseColors, 0);
      if (i < textBytes.length) {
        const charByte = textBytes[i];
        const baseByte = baseColors[i];

        // Ensure we don't multiply by zero (zero has no inverse in GF(2^8))
        const safeCharByte = charByte === 0 ? 1 : charByte;
        const safeBaseByte = baseByte === 0 ? 1 : baseByte;

        // GF(2^8) Color Blending: Modifies the base color channel using the character byte
        blendedColors[i] = GaloisField28.mul(safeBaseByte || 0, safeCharByte || 0);
      } else {
        blendedColors[i] = baseColors[i]  || 0; // Unused channels remain untouched
      }
    }

    return blendedColors;
  }

  /**
   * Recovers the original text characters from the blended color channels 
   * using GF(2^8) inverse unblending.
   */
  public static decodeTextFromColors(blendedColors: Uint8Array, baseColors: Uint8Array, textLength: number): string {
    const recoveredBytes = new Uint8Array(textLength);

    for (let i = 0; i < textLength; i++) {
      const blendedByte = blendedColors[i];
      const baseByte = baseColors[i];

      const safeBaseByte = baseByte === 0 ? 1 : baseByte;
      const invBase = GaloisField28.inverse(safeBaseByte || 0);

      // Unblend by multiplying the blended channel by the inverse of the base channel
      recoveredBytes[i] = GaloisField28.mul(blendedByte || 0, invBase);
    }

    return new TextDecoder().decode(recoveredBytes);
  }
}

export function runGf28ColorStegano()
{
    // --- Example Usage ---
    const secretMessage = "RISUKKO";
    // Simulating a background image buffer (e.g., RGB pixel channels)
    const backgroundChannels = new Uint8Array([120, 200, 85, 42, 160, 99, 210, 255]);

    // 1. Encode text into color channels via GF(2^8) blending
    const blended = Gf28ColorStegano.encodeTextToColors(secretMessage, backgroundChannels);
    console.log("Blended Color Channels:", Array.from(blended));

    // 2. Extract and unblend text back out with zero rounding error
    const decodedText = Gf28ColorStegano.decodeTextFromColors(blended, backgroundChannels, secretMessage.length);
    console.log("Recovered Secret Text:", decodedText); // Outputs: "RISUKKO"
}