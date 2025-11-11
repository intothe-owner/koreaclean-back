// routes/protected.ts
import { Router } from 'express'; 
import { auth } from '../middlewares/auth';
const router = Router();

router.get('/me', auth(), (req, res) => res.json({ ok: true }));
router.get('/admin', auth(['ADMIN']), (req, res) => res.json({ ok: true }));
router.get('/admin', auth(['SUPER']), (req, res) => res.json({ ok: true }));

export default router;
