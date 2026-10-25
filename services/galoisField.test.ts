import { expect, test, describe } from "bun:test";
import { GaloisField256, KNOWN_POLYNOMIALS } from "./galoisField";

describe("GaloisField256 Comprehensive Mathematics Suite", () => {
  const gfAES = new GaloisField256(0x11b, 0x03);
  const gfRS = new GaloisField256(0x11d, 0x02);

  describe("Field Arithmetic Axioms (AES Poly 0x11B)", () => {
    test("Addition is bitwise XOR and satisfies commutativity: a + b = b + a", () => {
      expect(gfAES.add(0x57, 0x83)).toBe(0x57 ^ 0x83);
      expect(gfAES.add(0x83, 0x57)).toBe(0x57 ^ 0x83);
    });

    test("Additive inverse: a + a = 0 (Characteristic 2)", () => {
      for (let a = 0; a < 256; a += 17) {
        expect(gfAES.add(a, a)).toBe(0);
        expect(gfAES.subtract(a, a)).toBe(0);
      }
    });

    test("Multiplication identity: a * 1 = a and a * 0 = 0", () => {
      for (let a = 0; a < 256; a += 13) {
        expect(gfAES.multiply(a, 1)).toBe(a);
        expect(gfAES.multiply(a, 0)).toBe(0);
      }
    });

    test("Multiplication commutativity: a * b = b * a", () => {
      const samples = [0x02, 0x57, 0x13, 0xca, 0x83, 0xff];
      for (const a of samples) {
        for (const b of samples) {
          expect(gfAES.multiply(a, b)).toBe(gfAES.multiply(b, a));
        }
      }
    });

    test("Distributivity: a * (b + c) = (a * b) + (a * c)", () => {
      const a = 0x57;
      const b = 0x83;
      const c = 0x13;
      const left = gfAES.multiply(a, gfAES.add(b, c));
      const right = gfAES.add(gfAES.multiply(a, b), gfAES.multiply(a, c));
      expect(left).toBe(right);
    });

    test("Known AES Multiplication Vector: 0x57 * 0x83 = 0xc1", () => {
      // Classic FIPS 197 test vector: 0x57 * 0x83 = 0xc1 in GF(2^8) mod 0x11B
      expect(gfAES.multiply(0x57, 0x83)).toBe(0xc1);
      expect(gfAES.peasantMultiply(0x57, 0x83)).toBe(0xc1);
    });

    test("Multiplicative Inverses: for all a != 0, a * a^-1 = 1", () => {
      for (let a = 1; a < 256; a++) {
        const inv = gfAES.inverse(a);
        expect(inv).toBeGreaterThan(0);
        expect(gfAES.multiply(a, inv)).toBe(1);
      }
    });

    test("Division: a / b = a * b^-1", () => {
      for (let a = 1; a < 256; a += 23) {
        for (let b = 1; b < 256; b += 29) {
          const div = gfAES.divide(a, b);
          expect(gfAES.multiply(div, b)).toBe(a);
        }
      }
    });
  });

  describe("AES S-Box Generation Verification (FIPS 197)", () => {
    const { sbox, invSbox } = GaloisField256.computeAESSBox();

    test("AES S-Box standard values match official FIPS 197 specification", () => {
      expect(sbox[0x00]).toBe(0x63);
      expect(sbox[0x01]).toBe(0x7c);
      expect(sbox[0x02]).toBe(0x77);
      expect(sbox[0x53]).toBe(0xed);
      expect(sbox[0x83]).toBe(0xec);
      expect(sbox[0xff]).toBe(0x16);
    });

    test("Inverse S-Box is exact bijective inverse of S-Box", () => {
      for (let i = 0; i < 256; i++) {
        const mapped = sbox[i]!;
        expect(invSbox[mapped]).toBe(i);
      }
    });
  });

  describe("Reed-Solomon & QR-Code Field (Poly 0x11D)", () => {
    test("Generator alpha = 2 generates 255 unique non-zero elements", () => {
      const seen = new Set<number>();
      for (let i = 0; i < 255; i++) {
        seen.add(gfRS.expTable[i]!);
      }
      expect(seen.size).toBe(255);
      expect(seen.has(0)).toBe(false);
    });

    test("Log table is exact inverse of exp table", () => {
      for (let i = 0; i < 255; i++) {
        const val = gfRS.expTable[i]!;
        expect(gfRS.logTable[val]).toBe(i);
      }
    });
  });

  describe("String Formats & Representations", () => {
    test("toPolynomialString returns mathematical notation", () => {
      expect(GaloisField256.toPolynomialString(0x00)).toBe("0");
      expect(GaloisField256.toPolynomialString(0x01)).toBe("1");
      expect(GaloisField256.toPolynomialString(0x02)).toBe("x");
      expect(GaloisField256.toPolynomialString(0x03)).toBe("x + 1");
      expect(GaloisField256.toPolynomialString(0x57)).toBe("x⁶ + x⁴ + x² + x + 1");
    });

    test("toBinaryString returns 8-character string", () => {
      expect(GaloisField256.toBinaryString(0x57)).toBe("01010111");
    });
  });
});
