// src/routes/authForgot.ts
import { Router, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { sendEmail } from '../lib/mailer';

const { User } = require('../../models'); // 프로젝트 구조에 맞게 경로 조정

const router = Router();

// ===== 환경변수 =====
const RESET_SECRET = process.env.JWT_RESET_SECRET || 'dev-reset-secret';
const FRONT_BASE_URL = process.env.FRONT_BASE_URL || 'http://localhost:3000';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_SECURE = (process.env.SMTP_SECURE || 'true') === 'true';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

// ===== nodemailer 트랜스포터 =====
const mailer = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

// ===== 헬퍼: 휴대폰 번호 정규화 (숫자만 남기기) =====
function normalizePhone(v: string): string {
  return v.replace(/\D/g, '');
}

// ===== 헬퍼: 이메일 마스킹 (아이디 일부만 보여주기) =====
function maskEmail(email: string): string {
  const [id, domain] = email.split('@');
  if (!id || !domain) return email;

  if (id.length <= 3) {
    return `${id[0]}***@${domain}`;
  }

  const visible = id.slice(0, 3);
  const hidden = '*'.repeat(Math.max(id.length - 3, 3));
  return `${visible}${hidden}@${domain}`;
}

/**
 * [POST] /auth/find-id-by-phone
 * body: { name: string, phone: string }
 * - 이름 + 휴대폰 번호로 가입된 계정의 "아이디(이메일)"을 찾아서 리턴
 */
router.post('/find-id-by-phone', async (req: Request, res: Response) => {
  try {
    const { name, phone } = req.body as { name?: string; phone?: string };
    console.log('아이디')
    if (!name || !phone) {
      return res.status(400).json({ message: '이름과 휴대폰 번호를 모두 입력해 주세요.' });
    }

   

    const user = await User.findOne({
      where: {
        name,
        // 프로젝트에서 실제 사용하는 컬럼명으로 수정 (mobile, phone, contact 등)
        phone
      },
    });

    if (!user) {
      return res.status(404).json({ message: '일치하는 회원 정보를 찾을 수 없습니다.' });
    }

    const email: string = user.email;
    return res.json({
      userId: email,
      userIdMasked: maskEmail(email),
      message: '가입하신 아이디를 찾았습니다.',
    });
  } catch (err) {
    console.error('find-id-by-phone error:', err);
    return res.status(500).json({ message: '아이디 조회 중 오류가 발생했습니다.' });
  }
});

/**
 * [POST] /auth/reset-password
 * body: { email: string, name: string }
 * - 이메일 + 이름 확인 후 비밀번호 재설정 링크 메일 발송
 */
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { email, name } = req.body as { email?: string; name?: string };

    if (!email || !name) {
      return res.status(400).json({ message: '이메일과 이름을 모두 입력해 주세요.' });
    }

    const user = await User.findOne({
      where: {
        email,
        name,
      },
    });

    if (!user) {
      // 보안상 "없다"를 너무 정확히 말하지 않는 것도 방법이지만
      // 여기서는 친절하게 표시
      return res.status(404).json({ message: '일치하는 회원 정보를 찾을 수 없습니다.' });
    }

    // 비밀번호 재설정을 위한 JWT 토큰 발급 (유효시간 10분 예시)
    const token = jwt.sign(
      {
        uid: user.id,
        type: 'reset-password',
      },
      RESET_SECRET,
      {
        expiresIn: '10m',
      }
    );

    const resetUrl = `${FRONT_BASE_URL}/reset-password?token=${token}`;

    const mailHtml = `
      <div style="font-family: Arial, sans-serif; font-size:14px;">
        <p>${user.name} 님, 안녕하세요.</p>
        <p>비밀번호 재설정을 위해 아래 링크를 클릭해 주세요.</p>
        <p style="margin:16px 0;">
          <a href="${resetUrl}" target="_blank" style="color:#2563eb;">
            비밀번호 재설정하기
          </a>
        </p>
        <p>※ 이 링크는 발급 후 10분 동안만 유효합니다.</p>
      </div>
    `;
    await sendEmail({
        to:email,
        subject:'경로당 케어 비밀번호 재설정 안내',
        html:mailHtml
    });
    return res.json({
      message: '비밀번호 재설정 링크를 이메일로 발송했습니다.',
    });
  } catch (err) {
    console.error('reset-password request error:', err);
    return res.status(500).json({ message: '비밀번호 재설정 메일 발송 중 오류가 발생했습니다.' });
  }
});

/**
 * [POST] /auth/reset-password/confirm
 * body: { token: string, newPassword: string }
 * - 이메일로 받은 토큰 + 새 비밀번호로 실제 비밀번호 변경
 */
router.post('/reset-password/confirm', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body as { token?: string; newPassword?: string };

    if (!token || !newPassword) {
      return res.status(400).json({ message: '토큰과 새 비밀번호를 모두 입력해 주세요.' });
    }

    let payload: any;
    try {
      payload = jwt.verify(token, RESET_SECRET);
    } catch (e) {
      return res.status(400).json({ message: '유효하지 않거나 만료된 링크입니다.' });
    }

    if (!payload || payload.type !== 'reset-password' || !payload.uid) {
      return res.status(400).json({ message: '잘못된 토큰입니다.' });
    }

    const user = await User.findByPk(payload.uid);
    console.log(user);
    if (!user) {
      return res.status(404).json({ message: '회원 정보를 찾을 수 없습니다.' });
    }

    // 비밀번호 해시 (bcrypt 사용)
    const hashed = await bcrypt.hash(newPassword, 10);
    user.password_hash = hashed;
    await user.save();

    return res.json({ message: '비밀번호가 성공적으로 변경되었습니다.' });
  } catch (err) {
    console.error('reset-password confirm error:', err);
    return res.status(500).json({ message: '비밀번호 변경 중 오류가 발생했습니다.' });
  }
});

export default router;
