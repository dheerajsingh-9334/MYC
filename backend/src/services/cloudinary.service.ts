import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary if credentials are provided in environment
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
} else {
  console.warn('[Cloudinary] Credentials missing. Uploads will run in mock/console mode.');
}

/**
 * Uploads a file (either buffer or file path) directly to Cloudinary.
 * @param file The file buffer or local file path.
 * @param folder The target folder in Cloudinary.
 * @param resourceType The resource type (auto, image, raw, video). Defaults to auto.
 */
export async function uploadToCloudinary(
  file: Buffer | string,
  folder = 'myc-ops',
  resourceType: 'auto' | 'image' | 'raw' | 'video' = 'auto'
): Promise<string> {
  // If credentials are missing, generate a mock or placeholder URL
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.warn('[Cloudinary] Mock upload fallback triggered.');
    const randomId = Math.random().toString(36).substring(7);
    return `https://mock-cloudinary-url.com/${folder}/${randomId}`;
  }

  return new Promise((resolve, reject) => {
    if (typeof file === 'string') {
      cloudinary.uploader.upload(
        file,
        { folder, resource_type: resourceType },
        (error, result) => {
          if (error) {
            console.error('[Cloudinary] upload error:', error);
            return reject(error);
          }
          resolve(result?.secure_url || '');
        }
      );
    } else {
      cloudinary.uploader.upload_stream(
        { folder, resource_type: resourceType },
        (error, result) => {
          if (error) {
            console.error('[Cloudinary] upload error:', error);
            return reject(error);
          }
          resolve(result?.secure_url || '');
        }
      ).end(file);
    }
  });
}
