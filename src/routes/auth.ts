import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';  
import jwt from 'jsonwebtoken';

const { Users } = require('../../models'); 

const router = Router();

import { JWT_SECRET, ACCESS_TTL_SEC, REMEMBER_TTL_SEC } from '../config/auth';  
/** 크로스 도메인이라면 SameSite=None + Secure 권장 */
const CROSS_SITE = (process.env.CROSS_SITE_COOKIES || '').toLowerCase() === 'true';
// sameSite 기본은 'lax' (동일 오리진일 때), 크로스면 'none'
const COOKIE_SAMESITE: 'lax' | 'none' = CROSS_SITE ? 'none' : 'lax';
const COOKIE_SECURE = CROSS_SITE || process.env.NODE_ENV === 'production';
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email = '', password = '', remember = false } = req.body || {};
    if (!email || !password) {
      return res.json({ is_success: false, msg: '이메일과 비밀번호를 입력하세요.' });
    }

    const user = await Users.findOne({ where: { email } });
    if (!user) return res.json({ is_success: false, msg: '이메일 또는 비밀번호가 올바르지 않습니다.' });

    const ok = await bcrypt.compare(password, user.hash_password);
    if (!ok) return res.json({ is_success: false, msg: '이메일 또는 비밀번호가 올바르지 않습니다.' });

    const ttl = remember ? REMEMBER_TTL_SEC : ACCESS_TTL_SEC;

    // role/is_confirm 없이 최소 정보만 담음
    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: ttl });

    // 쿠키로도 내려줌 (프론트 fetch에 credentials:'include' 필요)
    res.cookie('access_token', token, {
      httpOnly: true,
      sameSite: COOKIE_SAMESITE,   // 'lax' 또는 'none'
      secure: COOKIE_SECURE,       // SameSite 'none'이면 true 필수
      maxAge: ttl * 1000,
      path: '/',                   // 전체 경로에서 쿠키 사용
    });

    await user.update({ last_login_at: new Date() });

    return res.json({
      is_success: true,
      token, // 헤더 인증 쓰고 싶으면 이 값을 로컬스토리지에 저장해 Authorization로 보내면 됨
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        level: user.level,
        mobile: user.mobile,
      },
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
    });
  } catch (err) {
    console.error('[POST /login]', err);
    return res.json({ is_success: false, msg: '로그인 처리 중 오류가 발생했습니다.' });
  }
});

export default router;