import { Request, Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import { Transaction } from 'sequelize';
import * as jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { auth } from '../middlewares/auth';
import { sendEmail } from "../lib/mailer";
import { Op, fn, col, where as whereFn } from "sequelize";

dotenv.config();
type Secret = jwt.Secret;
type SignOptions = jwt.SignOptions;

const { User, Company, sequelize } = require('../../models');
export const router = Router();

const AUTO_LOGIN_ENABLED = String(process.env.AUTO_LOGIN_ENABLED).toLowerCase() === 'true';
const ACCESS_SECRET: Secret = (process.env.JWT_ACCESS_SECRET ?? 'dev-access') as Secret;
const REFRESH_SECRET: Secret = (process.env.JWT_REFRESH_SECRET ?? 'dev-refresh') as Secret;

// SignOptions['expiresIn']
const ACCESS_EXPIRES_IN = (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as SignOptions['expiresIn'];
const REFRESH_EXPIRES_IN = (process.env.JWT_REFRESH_EXPIRES_IN ?? '30d') as SignOptions['expiresIn'];

function cookieOpts(maxAgeMs?: number) {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
  };
}

function signAccessToken(user: { id: number | string; role?: string; provider?: string }) {
  const payload = { sub: user.id, role: user.role, provider: user.provider ?? 'local' };
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
}

function signRefreshToken(user: { id: number | string }) {
  const payload = { sub: user.id, t: 'refresh' as const };
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
}

/** 공통: 쿠키를 제거하며 비활성 안내 응답 */
function respondDeactivated(res: Response) {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
  return res.status(403).json({
    is_success: false,
    code: 'ACCOUNT_DEACTIVATED',
    message: '계정이 비활성화되었습니다. 관리자에게 문의하세요.',
  });
}

// ───────────────────────────────────────────────────────────────
// 이메일 중복 체크
router.get('/check', async (req: any, res: any) => {
  try {
    const row = await User.findAndCountAll({
      where: { email: req.query.email }
    });
    if (row.count === 0) {
      res.status(200).json({ is_success: true, exists: false });
    } else {
      res.status(200).json({ is_success: true, exists: true });
    }
  } catch (error) {
    return res.json({ is_success: false, msg: `${error} 오류 발생` });
  }
});

// ───────────────────────────────────────────────────────────────
// 회원 저장 (insert/update)
router.post('/save', async (req: Request, res: Response) => {
  const { mode, email, password, name, inst, contact, phone, role } = req.body ?? {};
  const normalizedEmail = (email ?? '').toString().trim().toLowerCase();
  const rawPassword = (password ?? '').toString();

  if (mode === 'insert') {
    if (!normalizedEmail || !rawPassword) {
      return res.status(400).json({ is_success: false, message: 'email과 password는 필수입니다.' });
    }
    if (rawPassword.length < 8) {
      return res.status(400).json({ is_success: false, message: '비밀번호는 8자 이상이어야 합니다.' });
    }
  }

  let t: Transaction | null = null;
  try {
    t = await sequelize.transaction();

    const exists = await User.findOne({ where: { email: normalizedEmail }, transaction: t });
    if (exists && mode === 'insert') {
      await t?.rollback();
      return res.status(409).json({ is_success: false, message: '이미 가입된 이메일입니다.' });
    }

    const password_hash = rawPassword ? await bcrypt.hash(rawPassword, 10) : undefined;

    let user: any;
    if (mode === 'insert') {
      user = await User.create(
        {
          email: normalizedEmail,
          password_hash,
          inst,
          name: name ? String(name).trim() : null,
          contact: contact ? String(contact).trim() : null,
          phone: phone ? String(phone).trim() : null,
          role: role ? String(role).trim() : null,
          // is_use 기본값(true) 모델에서 처리
        },
        { transaction: t }
      );
    } else {
      const fields: any = {
        inst,
        name: name ? String(name).trim() : null,
        contact: contact ? String(contact).trim() : null,
        phone: phone ? String(phone).trim() : null,
        role: role ? String(role).trim() : null,
      };
      if (password_hash) fields.password_hash = password_hash;

      await User.update(fields, { where: { email }, transaction: t });
      user = await User.findOne({ where: { email }, transaction: t });
    }

    await t?.commit();

    const { id, createdAt, updatedAt } = user;
    return res.status(201).json({
      is_success: true,
      message: '회원 처리가 완료되었습니다.',
      data: { id, email: normalizedEmail, name: user.name, phone: user.phone, createdAt, updatedAt },
    });
  } catch (err: any) {
    if (t) await t.rollback();
    if (err?.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ is_success: false, message: '이미 가입된 이메일입니다.' });
    }
    console.error('signup error:', err);
    return res.status(500).json({ is_success: false, message: '회원 처리 중 오류가 발생했습니다.' });
  }
});

// ───────────────────────────────────────────────────────────────
// 로그인 (is_use=false면 거부)
// ─── 로그인 (is_use=false면 거부)
router.post('/login', async (req: Request, res: Response) => {
  console.log('aaaa');
  const { email, password, rememberMe } = req.body ?? {};
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  const rawPassword = String(password ?? '');
  const password_hash = rawPassword ? await bcrypt.hash(rawPassword, 10) : undefined;
  console.log(password_hash);
  if (!normalizedEmail || !rawPassword) {
    return res.status(400).json({ is_success: false, message: 'email과 password는 필수입니다.' });
  }

  const user = await User.findOne({ where: { email: normalizedEmail } });
  if (!user) return res.status(401).json({ is_success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' });

  if (user.get('is_use') === false) {
    return res.status(403).json({
      is_success: false,
      code: 'ACCOUNT_DEACTIVATED',
      message: '탈퇴 처리된 계정입니다. 관리자에게 문의하세요.',
    });
  }

  const ok = await bcrypt.compare(rawPassword, user.get('password_hash') as string);
  if (!ok) return res.status(401).json({ is_success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' });

  // ✅ 토큰 생성 시, Sequelize 인스턴스에서 필요한 필드만 안전하게 뽑아서 사용
  const accessToken = signAccessToken({
    id: user.get('id'),
    role: user.get('role'),
    provider: (user.get('provider') as string) || 'local',
  });
  console.log(accessToken);
  // 쿠키에도 세팅 (기존 유지)
  res.cookie('access_token', accessToken, cookieOpts(30 * 60 * 1000)); // 30m

  let refreshToken: string | undefined = undefined;
  if (AUTO_LOGIN_ENABLED && rememberMe === true) {
    refreshToken = signRefreshToken({ id: user.get('id') });
    const refreshAgeMs = 30 * 24 * 60 * 60 * 1000;
    res.cookie('refresh_token', refreshToken, cookieOpts(refreshAgeMs));
  } else {
    res.clearCookie('refresh_token', { path: '/' });
  }

  // ✅ 여기! 응답 바디에 accessToken(필요하면 refreshToken도) 포함
  return res.json({
    is_success: true,
    message: '로그인 성공',
    data: {
      user: {
        id: user.get('id'),
        email: user.get('email'),
        name: user.get('name'),
        inst: user.get('inst'),
        contact: user.get('contact'),
        phone: user.get('phone'),
        role: user.get('role'),
        provider: user.get('provider') || 'local',
        createdAt: user.get('createdAt'),
        updatedAt: user.get('updatedAt'),
      },
      accessToken,
      ...(refreshToken ? { refreshToken } : {}),
    },
  });
});

// ───────────────────────────────────────────────────────────────
// 토큰 갱신 (비활성시 쿠키 제거 + 403)
router.post('/refresh', async (req: Request, res: Response) => {
  if (!AUTO_LOGIN_ENABLED) {
    return res.status(403).json({ is_success: false, message: '자동로그인이 비활성화되어 있습니다.' });
  }
  const rt = req.cookies?.refresh_token as string | undefined;
  if (!rt) return res.status(401).json({ is_success: false, message: '리프레시 토큰이 없습니다.' });

  try {
    const decoded = jwt.verify(rt, process.env.JWT_REFRESH_SECRET || 'dev-refresh') as any;
    const user = await User.findByPk(decoded.sub);
    if (!user) return res.status(401).json({ is_success: false, message: '유효하지 않은 토큰입니다.' });

    // ⛔ 비활성 계정: 강제 로그아웃
    if (user.get('is_use') === false) {
      return respondDeactivated(res);
    }

    const newAccess = signAccessToken(user);
    res.cookie('access_token', newAccess, cookieOpts(30 * 60 * 1000)); // 30m
    return res.json({ is_success: true, message: '토큰 갱신', data: { ok: true } });
  } catch (e) {
    return res.status(401).json({ is_success: false, message: '리프레시 토큰이 유효하지 않습니다.' });
  }
});

// ───────────────────────────────────────────────────────────────
// 내 정보 (비활성시 쿠키 제거 + 403)
router.get('/me',  async (req: Request, res: Response) => {
  
  try {
    const bearer = (req.headers.authorization ?? '') as string;
    const fromHeader = bearer.startsWith('Bearer ') ? bearer.split(' ')[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);
    
    if (!token) return res.status(401).json({ is_success: false, message: '인증 토큰이 필요합니다.' });
    

    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    const user = await User.findByPk(decoded.sub);
    if (!user) return res.status(401).json({ is_success: false, message: '유효하지 않은 토큰입니다.' });

    // ⛔ 비활성 계정: 강제 로그아웃
    if (user.get('is_use') === false) {
      return respondDeactivated(res);
    }
  
    console.log('token',token);
    return res.status(200).json({
      
      is_success: true,
      data: {
        user: {
          id: user.get('id'),
          email: user.get('email'),
          name: user.get('name'),
          inst: user.get('inst'),
          contact: user.get('contact'),
          phone: user.get('phone'),
          role: user.get('role'),
          provider: user.get('provider') || 'local',
          createdAt: user.get('createdAt'),
          updatedAt: user.get('updatedAt'),
        },
        token
      },
    });
  } catch(err:any) {
    console.log(err);
    return res.status(401).json({ is_success: false, message: '유효하지 않은 토큰입니다.' });
  }
});

// ───────────────────────────────────────────────────────────────
// 로그아웃
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
  return res.json({ is_success: true, message: '로그아웃 되었습니다.' });
});

// ───────────────────────────────────────────────────────────────
// 업체 승인 조회 (변경 없음)
router.get("/approv", async (req: Request, res: Response) => {
  try {
    const onlyApproved = ["1", "true", "yes"].includes(String(req.query.onlyApproved ?? "").toLowerCase());
    const queryEmail = String(req.query.email ?? "").trim();

    let userId: number | null = (req as any).user?.id ?? (req as any).auth?.userId ?? null;
    let userEmail: string | null = (req as any).user?.email ?? (req as any).auth?.email ?? null;
    let userName: string | null = (req as any).user?.name ?? (req as any).auth?.name ?? null;

    if (!userId) {
      if (!queryEmail) {
        return res.status(400).json({ is_success: false, msg: "email 파라미터가 필요합니다." });
      }
      const user = await User.findOne({ where: { email: queryEmail } });
      if (!user) return res.status(404).json({ is_success: false, msg: "USER_NOT_FOUND" });
      userId = (user as any).id;
      userEmail = (user as any).email;
      userName = (user as any).name ?? null;
    }

    const where: any = { owner_user_id: userId };
    if (onlyApproved) where.status = "APPROVED";

    const companies = await Company.findAll({
      where,
      order: [["updatedAt", "DESC"]],
      attributes: ["id", "name", "status"],
    });

    const normalizeStatus = (s: string) => {
      switch (s) {
        case "PENDING": return "submitted";
        case "APPROVED": return "approved";
        case "REJECTED": return "rejected";
        default: return s?.toLowerCase?.() ?? s;
      }
    };

    if (onlyApproved && companies.length === 0) {
      return res.status(404).json({
        is_success: false,
        msg: "NO_APPROVED_COMPANY",
        data: { email: userEmail, name: userName, company: null },
      });
    }

    const head = companies[0] ?? null;

    return res.json({
      is_success: true,
      data: head
        ? { email: userEmail, name: userName, company: { id: (head as any).id, name: (head as any).name, status: normalizeStatus((head as any).status) } }
        : { email: userEmail, name: userName, company: null },
      items: companies.map((c: any) => ({ id: c.id, name: c.name, status: normalizeStatus(c.status) })),
    });
  } catch (error: any) {
    console.error("[GET /users/approv] error:", error);
    return res.status(500).json({ is_success: false, msg: error?.message ?? "SERVER_ERROR" });
  }
});

// ───────────────────────────────────────────────────────────────
// 디버그 쿠키
router.get('/debug-cookies', (req, res) => {
  return res.json({ cookies: req.cookies, raw: req.headers.cookie });
});

// ───────────────────────────────────────────────────────────────
// 사용자 목록 (use=active|inactive|all)
router.get("/list", auth(), async (req: Request, res: Response) => {
  try {
    const {
      q = "",
      key = "email",
      role,
      page = "1",
      page_size = "10",
      order_by = "createdAt",
      order_dir = "DESC",
      use = "active", // active | inactive | all
    } = req.query as Record<string, string>;

    const p = Math.max(1, parseInt(String(page), 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(String(page_size), 10) || 10));

    const where: any = {};

    const useNorm = String(use).toLowerCase();
    if (useNorm === "active") where.is_use = true;
    else if (useNorm === "inactive") where.is_use = false;

    if (role) where.role = String(role).toUpperCase();

    const qstr = String(q).trim();
    if (qstr) {
      const like = { [Op.like]: `%${qstr}%` };
      if (key === "email") where.email = like;
      else if (key === "name") where.name = like;
      else if (key === "phone") {
        const qDigits = qstr.replace(/\D/g, "");
        where[Op.or] = [
          { phone: like },
          whereFn(fn("REPLACE", col("phone"), "-", ""), { [Op.like]: `%${qDigits}%` }),
        ];
      } else {
        const qDigits = qstr.replace(/\D/g, "");
        where[Op.or] = [
          { email: like },
          { name: like },
          { phone: like },
          whereFn(fn("REPLACE", col("phone"), "-", ""), { [Op.like]: `%${qDigits}%` }),
        ];
      }
    }

    const ORDER_FIELDS = new Set(["id","email","name","inst","role","createdAt","updatedAt"]);
    const orderField = ORDER_FIELDS.has(String(order_by)) ? String(order_by) : "createdAt";
    const orderDir = String(order_dir).toUpperCase() === "ASC" ? "ASC" : "DESC";

    const attributes = [
      "id","email","name","inst","contact","phone","role","provider",
      "is_use",
      "createdAt","updatedAt",
    ];

    const { rows, count } = await User.findAndCountAll({
      where,
      attributes,
      limit: size,
      offset: (p - 1) * size,
      order: [[orderField, orderDir]],
    });

    return res.json({
      is_success: true,
      page: p,
      page_size: size,
      total: count,
      total_pages: Math.max(1, Math.ceil(count / size)),
      items: rows,
    });
  } catch (err: any) {
    console.error("[GET /users/list] error:", err);
    return res.status(500).json({ is_success: false, message: err?.message ?? "SERVER_ERROR" });
  }
});

// ───────────────────────────────────────────────────────────────
// 공통 where 빌더 (발송용)
function buildWhereFromFilter(filter?: { q?: string; key?: string; role?: string }) {
  const where: any = {};
  if (!filter) return where;

  const { q = "", key = "email", role } = filter;

  if (role) where.role = String(role).toUpperCase();
  const qstr = String(q).trim();

  if (qstr) {
    const like = { [Op.like]: `%${qstr}%` };
    if (key === "email") where.email = like;
    else if (key === "name") where.name = like;
    else if (key === "phone") {
      const qDigits = qstr.replace(/\D/g, "");
      where[Op.or] = [
        { phone: like },
        whereFn(fn("REPLACE", col("phone"), "-", ""), { [Op.like]: `%${qDigits}%` }),
      ];
    } else {
      const qDigits = qstr.replace(/\D/g, "");
      where[Op.or] = [
        { email: like },
        { name: like },
        { phone: like },
        whereFn(fn("REPLACE", col("phone"), "-", ""), { [Op.like]: `%${qDigits}%` }),
      ];
    }
  }
  return where;
}

// ───────────────────────────────────────────────────────────────
// 이메일 발송 (활성 사용자만)
router.post("/send-email", auth(), async (req: Request, res: Response) => {
  try {
    const meRole = (req as any).user?.role ?? (req as any).auth?.role;
    if (!["ADMIN", "SUPER"].includes(String(meRole))) {
      return res.status(403).json({ is_success: false, message: "권한이 없습니다." });
    }

    type Payload = {
      mode: "ALL" | "SELECTED";
      subject: string;
      body: string;
      filter?: { q?: string; key?: "email" | "name" | "phone"; role?: string | "" };
      ids?: number[];
      isHtml?: boolean;
      dryRun?: boolean;
    };

    const { mode, subject, body, filter, ids = [], isHtml = true, dryRun = false } = (req.body ?? {}) as Payload;

    if (!mode || !subject?.trim() || !body?.trim()) {
      return res.status(400).json({ is_success: false, message: "mode, subject, body는 필수입니다." });
    }

    const MAX_RECIPIENTS = Number(process.env.EMAIL_MAX_RECIPIENTS ?? 1000);
    const attributes = ["id", "email", "name", "inst"] as const;
    let recipients: { id: number; email: string; name?: string | null; inst?: string | null }[] = [];

    if (mode === "ALL") {
      const where = { ...buildWhereFromFilter(filter), is_use: true }; // ✅ 활성만
      const rows = await User.findAll({
        where,
        attributes,
        limit: MAX_RECIPIENTS + 1,
        order: [["id", "ASC"]],
      });
      recipients = rows.map((r: any) => ({ id: r.id, email: r.email, name: r.name ?? null, inst: r.inst ?? null }))
                       .filter((r:any) => !!r.email);
    } else {
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ is_success: false, message: "ids가 비어있습니다." });
      }
      const rows = await User.findAll({
        where: { id: { [Op.in]: ids }, is_use: true }, // ✅ 활성만
        attributes,
        limit: Math.min(ids.length, MAX_RECIPIENTS),
        order: [["id", "ASC"]],
      });
      recipients = rows.map((r: any) => ({ id: r.id, email: r.email, name: r.name ?? null, inst: r.inst ?? null }))
                       .filter((r:any) => !!r.email);
    }

    if (recipients.length === 0) {
      return res.status(400).json({ is_success: false, message: "수신 대상이 없습니다." });
    }
    if (recipients.length > MAX_RECIPIENTS) {
      return res.status(413).json({
        is_success: false,
        message: `수신 대상이 너무 많습니다. (최대 ${MAX_RECIPIENTS}명, 현재 ${recipients.length}명)`,
        data: { total: recipients.length, limit: MAX_RECIPIENTS },
      });
    }

    if (dryRun) {
      return res.json({
        is_success: true,
        message: "드라이런 - 발송 미수행",
        data: { total: recipients.length, mode, filter, idsCount: ids?.length ?? 0 },
      });
    }

    const html = isHtml ? body : body.replace(/\n/g, "<br>");
    const text = isHtml ? body.replace(/<[^>]+>/g, "").replace(/<br\s*\/?>/gi, "\n") : body;

    const CONCURRENCY = Number(process.env.EMAIL_CONCURRENCY ?? 5);
    let success = 0;
    const failed: Array<{ email: string; reason: string }> = [];

    async function sendOne(toEmail: string) {
      try {
        await sendEmail({ to: toEmail, subject, text, html });
        success += 1;
      } catch (e: any) {
        failed.push({ email: toEmail, reason: e?.message ?? "UNKNOWN" });
      }
    }

    const active = new Set<Promise<void>>();
    for (const r of recipients) {
      const p = sendOne(r.email).finally(() => { active.delete(p); });
      active.add(p);
      if (active.size >= CONCURRENCY) await Promise.race(active);
    }
    await Promise.allSettled(active);

    return res.json({
      is_success: failed.length === 0,
      message: failed.length ? "일부 실패가 발생했습니다." : "발송 완료",
      data: { requested: recipients.length, success, failedCount: failed.length, failed },
    });
  } catch (err: any) {
    console.error("[POST /users/send-email] error:", err);
    return res.status(500).json({ is_success: false, message: err?.message ?? "SERVER_ERROR" });
  }
});

// ───────────────────────────────────────────────────────────────
// 사용 여부 토글 (탈퇴/복구) — 본인 계정 탈퇴 시 즉시 로그아웃
router.patch("/use/:id", auth(), async (req: Request, res: Response) => {
  try {
    const meId = Number((req as any).user?.id ?? (req as any).auth?.userId);
    const meRole = (req as any).user?.role ?? (req as any).auth?.role;
    if (!["ADMIN","SUPER"].includes(String(meRole))) {
      return res.status(403).json({ is_success:false, message:"권한이 없습니다." });
    }

    const id = Number(req.params.id);
    const { is_use } = req.body ?? {};
    if (!Number.isFinite(id) || typeof is_use !== "boolean") {
      return res.status(400).json({ is_success:false, message:"id와 is_use(boolean)가 필요합니다." });
    }

    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ is_success:false, message:"USER_NOT_FOUND" });

    await user.update({ is_use });

    // 만약 본인이 자기 계정을 '탈퇴(false)'로 변경했다면 즉시 로그아웃 쿠키 제거
    if (id === meId && is_use === false) {
      res.clearCookie('access_token', { path: '/' });
      res.clearCookie('refresh_token', { path: '/' });
    }

    return res.json({
      is_success:true,
      message: is_use ? "계정이 활성화되었습니다." : "계정이 탈퇴 처리되었습니다.",
      data: { id: user.id, is_use: user.get('is_use') }
    });
  } catch (err:any) {
    console.error("[PATCH /users/use/:id] error:", err);
    return res.status(500).json({ is_success:false, message: err?.message ?? "SERVER_ERROR" });
  }
});

export default router;
