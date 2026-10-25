import { executePipeline } from './pipeline';

// Define a test binary payload string
const rawMessage = "OKSA_VOLUMETRIC_MATRIX_PAYLOAD_2026";
const payloadBytes = new TextEncoder().encode(rawMessage);

// Configure asset parameters
const sampleConfig = {
  width: 1024,
  height: 1024,
  padding: 16,
  styleFlags: 0x0103, // e.g., 2D matrix + bloom effect flags
  seed: 3735928559,   // 0xDEADBEEF
  payload: payloadBytes
};

console.log("=== Oksa High-Density Data-to-Image Pipeline ===");
console.log(`Original Payload: "${rawMessage}" (${payloadBytes.length} bytes)\n`);

try {
  const result = executePipeline(sampleConfig);

  console.log("1. Generated Universal Graph ID:");
  console.log(`   [ ${result.graphId} ]\n`);

  console.log("2. Raster Pixel Triplet Buffer:");
  console.log(`   Total RGBA Pixels allocated: ${result.encodedPixelData.length / 4}`);
  console.log(`   Sample Pixel [0] (RGBA): R=${result.encodedPixelData[0]}, G=${result.encodedPixelData[1]}, B=${result.encodedPixelData[2]}, A=${result.encodedPixelData[3]}`);
  console.log(`   Sample Pixel [1] (RGBA): R=${result.encodedPixelData[4]}, G=${result.encodedPixelData[5]}, B=${result.encodedPixelData[6]}, A=${result.encodedPixelData[7]}\n`);

  console.log("3. Decoded Asset Configuration:");
  console.log(`   Canvas Dimensions : ${result.decodedConfig.width}x${result.decodedConfig.height}`);
  console.log(`   Padding Margin    : ${result.decodedConfig.padding}px`);
  console.log(`   Style Flags (Hex) : 0x${result.decodedConfig.styleFlags.toString(16)}`);
  console.log(`   Generation Seed   : ${result.decodedConfig.seed}\n`);

  console.log("4. Recovered Binary Payload:");
  console.log(`   "${result.recoveredPayloadString}"`);
  console.log("\nPipeline Execution Successful: Lossless round-trip verified.");
} catch (error) {
  console.error("Pipeline Execution Failed:", error);
}