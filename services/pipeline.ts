import { encodeGraphId, decodeGraphId, type AssetConfig } from './graphId';
import { bytesToRgbPixels, rgbPixelsToBytes } from './pixelMapper';


export interface PipelineResult {
  graphId: string;
  encodedPixelData: Uint8ClampedArray;
  decodedConfig: AssetConfig;
  recoveredPayloadString: string;
}

/**
 * Executes the complete Oksa data-to-image encoding and decoding pipeline.
 */
export function executePipeline(config: AssetConfig): PipelineResult {
  // Step 1: Serialize configuration and payload into the Universal Graph ID string
  const graphId = encodeGraphId(config);

  // Step 2: Convert the raw payload into high-density 3-byte RGB pixel triplets
  // (In production, the graphId or payload itself is packed into the canvas raster)
  const encodedPixelData = bytesToRgbPixels(config.payload);

  // Step 3: Simulate canvas extraction and decoding back to asset configuration
  const decodedConfig = decodeGraphId(graphId);

  // Step 4: Extract pixel bytes back from the raster buffer
  const recoveredBytes = rgbPixelsToBytes(encodedPixelData, decodedConfig.payload.length);
  const recoveredPayloadString = new TextDecoder().decode(recoveredBytes);

  return {
    graphId,
    encodedPixelData,
    decodedConfig,
    recoveredPayloadString
  };
}