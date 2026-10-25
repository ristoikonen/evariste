import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// Configure S3 client for Cloudflare R2
const s3 = new S3Client({
  region: "auto", // R2 uses 'auto' for regioning
  endpoint: Bun.env.S3_ENDPOINT, // https://<ACCOUNT_ID>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: Bun.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: Bun.env.S3_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = Bun.env.S3_BUCKET_NAME || "risukko-vault";

// Simple in-memory LRU cache to eliminate redundant R2 read requests
class IdentifierCache {
  private cache = new Map<string, { buffer: Uint8Array; timestamp: number }>();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize = 1000, ttlMs = 1000 * 60 * 15) { // 15-minute default TTL
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  public get(key: string): Uint8Array | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    // Refresh position for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.buffer;
  }

  public set(key: string, buffer: Uint8Array): void {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, { buffer, timestamp: Date.now() });
  }
}

const idCache = new IdentifierCache();

/**
 * Check if a universal ID or name already exists in R2 storage.
 */
export async function checkIdentifierExists(universalId: string): Promise<boolean> {
  const cached = idCache.get(universalId);
  if (cached) return true;

  try {
    await s3.send(new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `ids/${universalId}.bin`,
    }));
    return true;
  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Store the generated 14-byte packet and cache it locally in Bun.
 */
export async function storeIdentifier(universalId: string, payloadBuffer: Uint8Array): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: `ids/${universalId}.bin`,
    Body: payloadBuffer,
    ContentType: "application/octet-stream",
  }));

  // Cache immediately after successful write
  idCache.set(universalId, payloadBuffer);
}

/**
 * Retrieve the 14-byte payload buffer for a given universal ID.
 */
export async function getIdentifier(universalId: string): Promise<Uint8Array | null> {
  const cached = idCache.get(universalId);
  if (cached) return cached;

  try {
    const response = await s3.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `ids/${universalId}.bin`,
    }));

    if (!response.Body) return null;

    // Convert stream to Uint8Array in Bun
    const byteArray = await response.Body.transformToByteArray();
    idCache.set(universalId, byteArray);
    return byteArray;
  } catch (error: any) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}