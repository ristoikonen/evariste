/**
 * Galois Field GF(2^8) Arithmetic and LBC (Linear Block Code) Steganographic Engine
 * Designed for Oksa Project - Pure TypeScript / Bun (No UI).
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
      this.expTable[i] = this.expTable[i - 255] || 0;
    }
    this.logTable[0] = 0;
    this.initialized = true;
  }

  public static add(a: number, b: number): number {
    return a ^ b;
  }

  public static sub(a: number, b: number): number {
    return a ^ b;
  }

  public static mul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    this.init();
    return this.expTable[(this.logTable[a] || 0 )+ (this.logTable[b]  || 0 )]  || 0;
  }

  public static div(a: number, b: number): number {
    if (b === 0) throw new Error("Division by zero in GF(2^8)");
    if (a === 0) return 0;
    this.init();
    const logDiff = (this.logTable[a]  || 0) - (this.logTable[b]  || 0) + 255;
    return this.expTable[logDiff] || 0;
  }

  public static pow(a: number, n: number): number {
    if (a === 0) return 0;
    if (n === 0) return 1;
    this.init();
    const logVal = (this.logTable[a]  || 0* (n % 255)) % 255;
    return this.expTable[logVal < 0 ? logVal + 255 : logVal] || 0;
  }

  public static inverse(a: number): number {
    if (a === 0) throw new Error("Inverse of zero");
    this.init();
    return this.expTable[255 - (this.logTable[a]|| 0)] || 0;
  }
}

export interface LbcStegOptions {
  blockLength?: number;   // n (default 255)
  messageLength?: number; // k (default 223)
}

/**
 * Linear Block Code (LBC) with GF(2^8) Arithmetic Steganographic Class
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
      const alpha_i = GaloisField28.pow(2, i);
      
      for (let j = 0; j < g.length; j++) {
        nextG[j] = GaloisField28.add(nextG[j] || 0, g[j] || 0);
        nextG[j + 1] = GaloisField28.add(nextG[j + 1] || 0, GaloisField28.mul(g[j] || 0, alpha_i));
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
          temp[i + j] = GaloisField28.add(temp[i + j] || 0, GaloisField28.mul(generator[j] || 0, coef || 0));
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
        // Embed LBC codeword nibbles into carrier byte space via GF(2^8) addition
        outputCarrier[carrierOffset + i] = GaloisField28.add(cByte  || 0& 0xf0, codeword[i] || 0 >> 4);
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
        codeword[i] = (cByte || 0 & 0x0f) << 4;
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