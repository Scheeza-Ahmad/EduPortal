import { v2 as cloudinary } from 'cloudinary';

const FREE_TIER_STORAGE_BYTES = 25 * 1024 * 1024 * 1024; // 25GB (Cloudinary free tier)

let configured = false;
function ensureConfigured() {
  if (configured) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  configured = true;
}

export interface StorageUsage {
  usedBytes: number;
  limitBytes: number;
  percentUsed: number;
}

/** Returns null if Cloudinary isn't configured or the usage call fails — never throws. */
export async function getStorageUsage(): Promise<StorageUsage | null> {
  if (!process.env.CLOUDINARY_CLOUD_NAME) return null;

  try {
    ensureConfigured();
    const usage = await cloudinary.api.usage();
    const usedBytes: number = usage?.storage?.usage ?? 0;
    return {
      usedBytes,
      limitBytes: FREE_TIER_STORAGE_BYTES,
      percentUsed: Math.round((usedBytes / FREE_TIER_STORAGE_BYTES) * 1000) / 10,
    };
  } catch (err) {
    console.warn('[cloudinaryUsage] Failed to fetch usage:', err);
    return null;
  }
}
