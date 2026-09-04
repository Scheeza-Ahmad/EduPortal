import { Router } from 'express';
import multer from 'multer';
import { AuthRequest, verifyToken } from '../middleware/auth';
import { send } from '../utils/response';
import { isCloudinaryConfigured, uploadBuffer } from '../utils/cloudinary';

const router = Router();

// Memory storage — files never touch disk, we stream the buffer straight to
// Cloudinary. 10MB cap keeps a stray upload from ever ballooning a request.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(verifyToken);

// POST /api/upload — multipart/form-data, field name "file". Any
// authenticated role may use this (teachers attaching activity files,
// students attaching submissions, admin/finance attaching documents) — the
// file itself carries no school/role-sensitive data, only its resulting URL
// does, and that URL is only ever attached to records the caller's own
// role-scoped endpoints already guard.
router.post('/', upload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) {
    send(res, 400, undefined, 'No file provided');
    return;
  }

  if (!isCloudinaryConfigured()) {
    send(res, 503, undefined, 'File uploads are not configured on this server yet');
    return;
  }

  try {
    const result = await uploadBuffer(req.file.buffer);
    send(res, 201, { url: result.url, publicId: result.publicId, bytes: result.bytes });
  } catch (err) {
    console.error('[upload] Cloudinary upload failed', { userId: req.user?.userId, err });
    send(res, 500, undefined, 'File upload failed. Please try again.');
  }
});

export default router;
