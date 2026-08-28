import cron from 'node-cron';
import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const FREE_TIER_STORAGE_BYTES = 25 * 1024 * 1024 * 1024; // 25GB (Cloudinary free tier)
const WARNING_THRESHOLD = 0.8; // 80%

export function startStorageWarning(): void {
  // Every day at 09:00
  cron.schedule('0 9 * * *', async () => {
    try {
      const usage = await cloudinary.api.usage();
      const usedBytes: number = usage?.storage?.usage ?? 0;
      const percentUsed = usedBytes / FREE_TIER_STORAGE_BYTES;

      if (percentUsed < WARNING_THRESHOLD) return;

      const superAdmins = await prisma.user.findMany({
        where: { role: 'super_admin', isActive: true },
      });

      await Promise.all(
        superAdmins.map((admin) =>
          sendEmail({
            to: admin.email,
            subject: 'EduPortal storage warning',
            html: `<p>Cloudinary storage is at ${(percentUsed * 100).toFixed(
              1
            )}% of the free tier limit (25GB). Consider cleaning up old files.</p>`,
          })
        )
      );
    } catch (err) {
      console.error('storageWarning job failed:', err);
    }
  });
}
