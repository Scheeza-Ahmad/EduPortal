import { v2 as cloudinary } from 'cloudinary';

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

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
  );
}

export interface UploadResult {
  url: string;
  publicId: string;
  resourceType: string;
  bytes: number;
}

/**
 * Uploads a buffer (from multer's memory storage) to Cloudinary and returns
 * its secure URL. Files land in an `eduportal/` folder, `resource_type:
 * 'auto'` so images, PDFs and other docs all work through the same endpoint.
 */
export async function uploadBuffer(buffer: Buffer, folder = 'eduportal'): Promise<UploadResult> {
  ensureConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto' },
      (err, result) => {
        if (err || !result) {
          reject(err ?? new Error('Cloudinary upload returned no result'));
          return;
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type,
          bytes: result.bytes,
        });
      }
    );
    stream.end(buffer);
  });
}
