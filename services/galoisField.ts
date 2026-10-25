/**
 * ============================================================================
 * ÉVARISTE FINITE FIELD GF(2^8) CORE ENGINE
 * Complete Galois Field Arithmetic, AES S-Box & Error-Correction Implementation
 * ============================================================================
 */

export interface IrreduciblePolyInfo {
  name: string;
  poly: number; // 9-bit representation e.g. 0x11B = 283
  formula: string;
  defaultGenerator: number;
  description: string;
}

export const KNOWN_POLYNOMIALS: Record<number, IrreduciblePolyInfo> = {
  0x11b: {
    name: "AES / Rijndael",
    poly: 0x11b,
    formula: "x⁸ + x⁴ + x³ + x + 1",
    defaultGenerator: 0x03,
    description: "FIPS 197 standard for AES. Used globally for internet data encryption."
  },
  0x11d: {
    name: "Reed-Solomon / QR Code",
    poly: 0x11d,
    formula: "x⁸ + x⁴ + x³ + x² + 1",
    defaultGenerator: 0x02,
    description: "Standard for QR codes, CD/DVD error correction, and RAID-6 architectures."
  },
  0x12d: {
    name: "GF-301",
    poly: 0x12d,
    formula: "x⁸ + x⁵ + x³ + x² + 1",
    defaultGenerator: 0x02,
    description: "Alternative degree-8 primitive polynomial."
  },
  0x14d: {
    name: "GF-333",
    poly: 0x14d,
    formula: "x⁸ + x⁶ + x³ + x² + 1",
    defaultGenerator: 0x02,
    description: "Degree-8 primitive polynomial used in telecommunications."
  },
  0x15f: {
    name: "GF-351",
    poly: 0x15f,
    formula: "x⁸ + x⁶ + x⁴ + x³ + x² + x + 1",
    defaultGenerator: 0x02,
    description: "High-density weight primitive polynomial."
  },
  0x163: {
    name: "GF-355",
    poly: 0x163,
    formula: "x⁸ + x⁶ + x⁵ + x + 1",
    defaultGenerator: 0x02,
    description: "Degree-8 irreducible polynomial."
  },
  0x165: {
    name: "GF-357",
    poly: 0x165,
    formula: "x⁸ + x⁶ + x⁵ + x² + 1",
    defaultGenerator: 0x02,
    description: "Degree-8 irreducible polynomial."
  },
  0x169: {
    name: "GF-361",
    poly: 0x169,
    formula: "x⁸ + x⁶ + x⁵ + x³ + 1",
    defaultGenerator: 0x02,
    description: "Degree-8 irreducible polynomial."
  },
  0x171: {
    name: "GF-369",
    poly: 0x171,
    formula: "x⁸ + x⁶ + x⁵ + x⁴ + 1",
    defaultGenerator: 0x02,
    description: "Degree-8 irreducible polynomial."
  },
  0x187: {
    name: "RAID-6 / x264",
    poly: 0x187,
    formula: "x⁸ + x⁷ + x² + x + 1",
    defaultGenerator: 0x02,
    description: "Widely utilized in Linux RAID-6 dual-parity calculations."
  },
  0x18d: {
    name: "GF-397",
    poly: 0x18d,
    formula: "x⁸ + x⁷ + x³ + x² + 1",
    defaultGenerator: 0x02,
    description: "Degree-8 irreducible polynomial."
  },
  0x1a9: {
    name: "GF-425",
    poly: 0x1a9,
    formula: "x⁸ + x⁷ + x⁵ + x³ + 1",
    defaultGenerator: 0x02,
    description: "Degree-8 irreducible polynomial."
  },
  0x1e7: {
    name: "GF-487",
    poly: 0x1e7,
    formula: "x⁸ + x⁷ + x⁶ + x⁵ + x² + x + 1",
    defaultGenerator: 0x02,
    description: "Degree-8 irreducible polynomial."
  },
  0x1f5: {
    name: "GF-501",
    poly: 0x1f5,
    formula: "x⁸ + x⁷ + x⁶ + x⁵ + x⁴ + x² + 1",
    defaultGenerator: 0x02,
    description: "Degree-8 irreducible polynomial."
  }
};

export interface PeasantStep {
  step: number;
  multiplierBit: number;
  currentA: number;
  currentB: number;
  hiBitSet: boolean;
  nextA: number;
  accumulator: number;
  explanation: string;
}

export class GaloisField256 {
  public readonly poly: number;
  public readonly generator: number;
  public readonly expTable = new Uint8Array(512);
  public readonly logTable = new Uint8Array(256);
  public readonly invTable = new Uint8Array(256);

  constructor(poly = 0x11b, generator?: number) {
    this.poly = poly;
    this.generator = generator ?? (KNOWN_POLYNOMIALS[poly]?.defaultGenerator ?? this.findFirstGenerator(poly));
    this.initTables();
  }

  private initTables() {
    this.expTable.fill(0);
    this.logTable.fill(0);
    this.invTable.fill(0);

    let x = 1;
    for (let i = 0; i < 255; i++) {
      this.expTable[i] = x;
      this.logTable[x] = i;
      x = this.peasantMultiply(x, this.generator);
    }

    // Extended duplicate upper half for fast modulo 255 lookup
    for (let i = 255; i < 512; i++) {
      this.expTable[i] = this.expTable[i - 255] ?? 0;
    }

    // Precalculate multiplicative inverses:
    // For x != 0, x * x^-1 = 1 => log(x) + log(x^-1) = 255
    this.invTable[0] = 0; // 0 has no inverse; mapped to 0 by standard convention
    for (let a = 1; a < 256; a++) {
      const logA = this.logTable[a] ?? 0;
      const invLog = (255 - logA) % 255;
      this.invTable[a] = this.expTable[invLog] ?? 0;
    }
  }

  /**
   * Shift-and-add (Peasant) multiplication modulo this.poly.
   * Works unconditionally without requiring precomputed tables.
   */
  public peasantMultiply(a: number, b: number): number {
    let p = 0;
    let tempA = a & 0xff;
    let tempB = b & 0xff;

    for (let i = 0; i < 8; i++) {
      if (tempB & 1) {
        p ^= tempA;
      }
      const hiBitSet = (tempA & 0x80) !== 0;
      tempA = (tempA << 1) & 0xff;
      if (hiBitSet) {
        tempA ^= (this.poly & 0xff);
      }
      tempB >>= 1;
    }

    return p & 0xff;
  }

  /**
   * Generates step-by-step execution trace of Peasant multiplication for educational display.
   */
  public tracePeasantMultiplication(a: number, b: number): PeasantStep[] {
    const steps: PeasantStep[] = [];
    let p = 0;
    let tempA = a & 0xff;
    let tempB = b & 0xff;

    for (let i = 0; i < 8; i++) {
      const bit = tempB & 1;
      const hiBitSet = (tempA & 0x80) !== 0;
      const oldAccumulator = p;

      if (bit === 1) {
        p ^= tempA;
      }

      const nextA = ((tempA << 1) & 0xff) ^ (hiBitSet ? (this.poly & 0xff) : 0);

      steps.push({
        step: i,
        multiplierBit: bit,
        currentA: tempA,
        currentB: tempB,
        hiBitSet,
        nextA,
        accumulator: p,
        explanation: bit === 1
          ? `Bit ${i} is 1: XOR accumulator (${oldAccumulator.toString(16).toUpperCase()}) with current A (${tempA.toString(16).toUpperCase()}) => ${p.toString(16).toUpperCase()}.${hiBitSet ? ` High bit set: A shifted and reduced with 0x${(this.poly & 0xff).toString(16).toUpperCase()}.` : ` High bit 0: simple shift.`}`
          : `Bit ${i} is 0: Accumulator unchanged (${p.toString(16).toUpperCase()}).${hiBitSet ? ` High bit set: A shifted and reduced with 0x${(this.poly & 0xff).toString(16).toUpperCase()}.` : ` High bit 0: simple shift.`}`
      });

      tempA = nextA;
      tempB >>= 1;
    }

    return steps;
  }

  /**
   * GF(2^8) Addition is bitwise XOR.
   */
  public add(a: number, b: number): number {
    return (a ^ b) & 0xff;
  }

  /**
   * GF(2^8) Subtraction is identical to addition (characteristic 2).
   */
  public subtract(a: number, b: number): number {
    return (a ^ b) & 0xff;
  }

  /**
   * Table-accelerated multiplication using precomputed log/exp tables.
   */
  public multiply(a: number, b: number): number {
    const cleanA = a & 0xff;
    const cleanB = b & 0xff;
    if (cleanA === 0 || cleanB === 0) return 0;
    const logA = this.logTable[cleanA] ?? 0;
    const logB = this.logTable[cleanB] ?? 0;
    return this.expTable[logA + logB] ?? 0;
  }

  /**
   * Division in GF(2^8): a / b = a * (b^-1).
   */
  public divide(a: number, b: number): number {
    const cleanA = a & 0xff;
    const cleanB = b & 0xff;
    if (cleanB === 0) throw new Error("GaloisField256: Division by zero in finite field.");
    if (cleanA === 0) return 0;
    const logA = this.logTable[cleanA] ?? 0;
    const logB = this.logTable[cleanB] ?? 0;
    let diff = logA - logB;
    if (diff < 0) diff += 255;
    return this.expTable[diff] ?? 0;
  }

  /**
   * Multiplicative inverse of an element: a * a^-1 = 1.
   */
  public inverse(a: number): number {
    return this.invTable[a & 0xff] ?? 0;
  }

  /**
   * Exponentiation: a^n in GF(2^8).
   */
  public power(a: number, n: number): number {
    const cleanA = a & 0xff;
    if (cleanA === 0) return 0;
    if (n === 0) return 1;
    let normN = n % 255;
    if (normN < 0) normN += 255;
    const logA = this.logTable[cleanA] ?? 0;
    return this.expTable[(logA * normN) % 255] ?? 0;
  }

  /**
   * Multiplicative order of an element in GF(2^8)*.
   * Smallest k > 0 such that a^k = 1.
   */
  public order(a: number): number {
    const cleanA = a & 0xff;
    if (cleanA === 0) return 0;
    if (cleanA === 1) return 1;
    let cur = cleanA;
    for (let k = 1; k <= 255; k++) {
      if (cur === 1) return k;
      cur = this.multiply(cur, cleanA);
    }
    return 255;
  }

  /**
   * Finds all primitive roots (generators of order 255) for this field.
   */
  public findAllGenerators(): number[] {
    const generators: number[] = [];
    for (let a = 2; a < 256; a++) {
      if (this.order(a) === 255) {
        generators.push(a);
      }
    }
    return generators;
  }

  private findFirstGenerator(poly: number): number {
    for (let candidate = 2; candidate < 256; candidate++) {
      let x = 1;
      const seen = new Set<number>();
      for (let i = 0; i < 255; i++) {
        seen.add(x);
        x = this.peasantMultiplyWithPoly(x, candidate, poly);
      }
      if (seen.size === 255 && !seen.has(0)) {
        return candidate;
      }
    }
    return 2;
  }

  private peasantMultiplyWithPoly(a: number, b: number, poly: number): number {
    let p = 0;
    let tempA = a & 0xff;
    let tempB = b & 0xff;
    for (let i = 0; i < 8; i++) {
      if (tempB & 1) p ^= tempA;
      const hi = (tempA & 0x80) !== 0;
      tempA = (tempA << 1) & 0xff;
      if (hi) tempA ^= (poly & 0xff);
      tempB >>= 1;
    }
    return p & 0xff;
  }

  /**
   * Computes the 256-byte AES S-Box table using GF(2^8) inversion and affine mapping.
   */
  public static computeAESSBox(): { sbox: Uint8Array; invSbox: Uint8Array } {
    const gf = new GaloisField256(0x11b, 0x03);
    const sbox = new Uint8Array(256);
    const invSbox = new Uint8Array(256);

    for (let byte = 0; byte < 256; byte++) {
      // 1. Multiplicative inversion in GF(2^8) (with 0 mapped to 0)
      const inv = gf.inverse(byte);

      // 2. Affine transformation over GF(2):
      // s_i = y_i ^ y_(i+4)%8 ^ y_(i+5)%8 ^ y_(i+6)%8 ^ y_(i+7)%8 ^ c_i
      // where c = 0x63 (0b01100011)
      let s = 0;
      for (let i = 0; i < 8; i++) {
        const bit0 = (inv >> i) & 1;
        const bit4 = (inv >> ((i + 4) % 8)) & 1;
        const bit5 = (inv >> ((i + 5) % 8)) & 1;
        const bit6 = (inv >> ((i + 6) % 8)) & 1;
        const bit7 = (inv >> ((i + 7) % 8)) & 1;
        const cBit = (0x63 >> i) & 1;

        const outBit = bit0 ^ bit4 ^ bit5 ^ bit6 ^ bit7 ^ cBit;
        s |= (outBit << i);
      }

      sbox[byte] = s;
      invSbox[s] = byte;
    }

    return { sbox, invSbox };
  }

  /**
   * Formats an 8-bit integer into its polynomial representation in F2[x].
   */
  public static toPolynomialString(byte: number): string {
    const clean = byte & 0xff;
    if (clean === 0) return "0";
    const terms: string[] = [];
    for (let i = 7; i >= 0; i--) {
      if ((clean >> i) & 1) {
        if (i === 0) terms.push("1");
        else if (i === 1) terms.push("x");
        else {
          const sup = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷"][i];
          terms.push(`x${sup}`);
        }
      }
    }
    return terms.join(" + ");
  }

  /**
   * Formats an 8-bit integer into 8 binary bits.
   */
  public static toBinaryString(byte: number): string {
    return (byte & 0xff).toString(2).padStart(8, "0");
  }

  /**
   * Formats an 8-bit integer into 2-digit uppercase hex with 0x prefix.
   */
  public static toHexString(byte: number): string {
    return "0x" + (byte & 0xff).toString(16).toUpperCase().padStart(2, "0");
  }
}
