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
 * Uploads a file buffer directly to Cloudinary.
 * @param fileBuffer The file buffer from multer.
 * @param folder The target folder in Cloudinary.
 */
export async function uploadToCloudinary(fileBuffer: Buffer, folder = 'myc-ops'): Promise<string> {
  // If credentials are missing, generate a mock or placeholder URL
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.warn('[Cloudinary] Mock upload fallback triggered.');
    const randomId = Math.random().toString(36).substring(7);
    return `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80&mock=${randomId}`;
  }

  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) {
          console.error('[Cloudinary] upload error:', error);
          return reject(error);
        }
        resolve(result?.secure_url || '');
      }
    ).end(fileBuffer);
  });
}
