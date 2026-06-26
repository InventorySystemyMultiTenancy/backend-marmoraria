import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';

// CLOUDINARY_URL (formato cloudinary://<api_key>:<api_secret>@<cloud_name>) e' lido
// automaticamente pelo SDK ao ser importado. Os 3 campos separados servem de fallback
// para ambientes que nao tem o CLOUDINARY_URL configurado.
if (!process.env.CLOUDINARY_URL) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export const uploadMarbleImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

export function uploadBufferToCloudinary(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'marmoraria/marbles',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 1600, height: 1600, crop: 'limit' }],
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Falha no upload'));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

export { cloudinary };
