
// Implementing GF2^8 Reed-Solomon verifier and repair engine using the standard AES irreducible polynomial (0x11B).
// AES Irreducible polynomial: x^8 + x^4 + x^3 + x + 1 = 0x11B ,binary 100011011 ,(PRIMITIVE_POLY)

class ChatMessageRepairer {
    
    private static readonly PRIMITIVE_POLY = 0x11B;
    private gfLog = new Uint8Array(256);
    private gfExp = new Uint8Array(512); // Doubled size to avoid modulo wrapping during lookup

    constructor() {
        this.initializeTables();
    }

    /**
     * Precomputes Log and Exponential lookup tables for fast GF(2^8) math.
     */
    private initializeTables(): void {
        let x = 1;
        for (let i = 0; i < 255; i++) {
            this.gfExp[i] = x;
            this.gfLog[x] = i;
            x <<= 1;
            if (x & 0x100) {
                x ^= ChatMessageRepairer.PRIMITIVE_POLY;
            }
        }
        // Mirror the exponential table to handle overflow easily during multiplication
        for (let i = 255; i < 512; i++) {
            this.gfExp[i] = this.gfExp[i - 255]!;
        }
    }

    private gfAdd(a: number, b: number): number {
        return a ^ b; // Addition and subtraction in GF(2^8) are bitwise XOR
    }

    private gfMultiply(a: number, b: number): number {
        if (a === 0 || b === 0) return 0;
        return this.gfExp[this.gfLog[a]! + this.gfLog[b]!]!;
    }

    private gfInverse(a: number): number {
        if (a === 0) throw new Error("Division by zero in GF(2^8)");
        return this.gfExp[255 - this.gfLog[a]!]!;
    }

    /**
     * Encodes a chat string, appending parity bytes for error correction.
     * @param message The raw text message.
     * @param parityBytes The number of parity bytes to add (must be an even number, e.g., 4).
     *                    Can correct up to (parityBytes / 2) corrupted characters.
     */
    public encode(message: string, parityBytes: number): Uint8Array {
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        
        // Generate generator polynomial coefficients
        let gPoly = new Uint8Array([1]);
        for (let i = 0; i < parityBytes; i++) {
            const nextRoot = this.gfExp[i];
            const temp = new Uint8Array(gPoly.length + 1);
            for (let j = 0; j < gPoly.length; j++) {
                temp[j]! ^= this.gfMultiply(gPoly[j]!, nextRoot!);
                temp[j + 1]! ^= gPoly[j]!;
            }
            gPoly = temp;
        }

        // Polynomial division (Data mod gPoly) to get parity
        const out = new Uint8Array(data.length + parityBytes);
        out.set(data);

        for (let i = 0; i < data.length; i++) {
            const coef = out[i];
            if (coef !== 0) {
                for (let j = 0; j < gPoly.length; j++) {
                    out[i + j]! ^= this.gfMultiply(gPoly[j]!, coef!);
                }
            }
        }
        
        // Restore original data bytes back to the front
        out.set(data);
        return out; // Contains [Data Bytes ... Parity Bytes]
    }

    /**
     * Verifies, locates, and automatically corrects errors within the received payload.
     */
    public decodeAndRepair(payload: Uint8Array, parityBytes: number): { success: boolean; message: string; fixedErrors: number } {
        // 1. Calculate Syndromes
        const syndromes = new Uint8Array(parityBytes);
        let hasErrors = false;
        for (let i = 0; i < parityBytes; i++) {
            let evalResult = 0;
            const root = this.gfExp[i];
            for (let j = 0; j < payload.length; j++) {
                evalResult = this.gfMultiply(evalResult, root!) ^ payload[j]!;
            }
            syndromes[i] = evalResult;
            if (evalResult !== 0) hasErrors = true;
        }

        // If all syndromes are 0, message is perfectly intact
        if (!hasErrors) {
            const dataBytes = payload.subarray(0, payload.length - parityBytes);
            return { success: true, message: new TextDecoder().decode(dataBytes), fixedErrors: 0 };
        }

        // 2. Berlekamp-Massey Algorithm to find the Error Locator Polynomial
        let C = new Uint8Array([1]);
        let B = new Uint8Array([1]);
        let L = 0;
        let m = 1;
        let b = 1;

        for (let r = 0; r < parityBytes; r++) {
            let disparity = syndromes[r];
            for (let i = 1; i <= L; i++) {
                disparity! ^= this.gfMultiply(C[i] || 0, syndromes[r - i]!);
            }

            if (disparity === 0) {
                m++;
            } else {
                const oldC = new Uint8Array(C);
                const scale = this.gfMultiply(disparity!, this.gfInverse(b));
                
                const tempB = new Uint8Array(B.length + m);
                for (let i = 0; i < B.length; i++) tempB[i + m] = this.gfMultiply(B[i]!, scale);
                
                const nextCLen = Math.max(C.length, tempB.length);
                const nextC = new Uint8Array(nextCLen);
                for (let i = 0; i < nextC.length; i++) nextC[i] = (C[i] || 0) ^ (tempB[i] || 0);
                C = nextC;

                if (2 * L <= r) {
                    L = r + 1 - L;
                    B = oldC;
                    b = disparity!;
                    m = 1;
                } else {
                    m++;
                }
            }
        }

        const errorCount = C.length - 1;
        if (errorCount > parityBytes / 2) {
            return { success: false, message: "Too many corrupted bytes to recover!", fixedErrors: 0 };
        }

        // 3. Chien Search to locate error positions
        const errorPositions: number[] = [];
        for (let i = 0; i < payload.length; i++) {
            const invPos = this.gfInverse(this.gfExp[i]!);
            let evalResult = 1;
            for (let j = 1; j < C.length; j++) {
                evalResult ^= this.gfMultiply(C[j]!, this.gfExp[(this.gfLog[invPos]! * j) % 255]!);
            }
            if (evalResult === 0) {
                errorPositions.push(payload.length - 1 - i);
            }
        }

        if (errorPositions.length !== errorCount) {
            return { success: false, message: "Error location evaluation mismatched coefficients.", fixedErrors: 0 };
        }

        // 4. Forney Algorithm to compute error magnitudes and repair values
        const omega = new Uint8Array(errorCount);
        for (let i = 0; i < errorCount; i++) {
            let val = syndromes[i];
            for (let j = 1; j <= i; j++) {
                val! ^= this.gfMultiply(C[j]!, syndromes[i - j]!);
            }
            omega[i] = val!;
        }

        for (const pos of errorPositions) {
            const xi = this.gfInverse(this.gfExp[payload.length - 1 - pos]!);
            
            let num = 0;
            for (let i = 0; i < omega.length; i++) {
                num ^= this.gfMultiply(omega[i]!, this.gfExp[(this.gfLog[xi]! * i) % 255]!);
            }

            let den = 0;
            for (let i = 1; i < C.length; i += 2) {
                den ^= this.gfMultiply(C[i]!, this.gfExp[(this.gfLog[xi]! * (i - 1)) % 255]!);
            }

            const errorMagnitude = this.gfMultiply(num, this.gfInverse(this.gfMultiply(xi, den)));
            payload[pos]! ^= errorMagnitude; // Repairing the corrupted byte!
        }

        const cleanedData = payload.subarray(0, payload.length - parityBytes);
        return {
            success: true,
            message: new TextDecoder().decode(cleanedData),
            fixedErrors: errorCount
        };
    }
}

// --- Execution Usage Demo ---
const engine = new ChatMessageRepairer();
const originalText = "Hello client! Transfer \$5000 to Account A.";
const paritySize = 6; // 6 parity bytes allows us to fix up to 3 completely corrupted characters

// 1. Sender encodes transmission
const transmission = engine.encode(originalText, paritySize);
console.log(`Original Transmission Payload Size: ${transmission.length} bytes`);

// 2. Simulate bad network tampering (Corrupt 2 distinct characters entirely)
transmission[6] = 0xFF;  // Tampered character 'c' -> broken byte
transmission[23] = 0xAA; // Tampered character '5' -> broken byte

// 3. Receiver runs the repair process
const processResult = engine.decodeAndRepair(transmission, paritySize);

console.log(`\nWas message successfully verified/repaired? ${processResult.success}`);
console.log(`Total corrupted characters self-healed: ${processResult.fixedErrors}`);
console.log(`Recovered Text Output: "${processResult.message}"`);
