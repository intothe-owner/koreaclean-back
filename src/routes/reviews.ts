// routes/reviews.ts
import { Router, Request, Response } from "express";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import fs from "fs";
import * as jwt from 'jsonwebtoken';
dotenv.config();

// 필요 시: 로그인 세션을 쓰면 여기서 가져오세요.
// import { auth } from "../middlewares/auth";

const { Review, User,sequelize } = require("../../models");
const { Op } = require("sequelize");
type Secret = jwt.Secret;
const ACCESS_SECRET: Secret = (process.env.JWT_ACCESS_SECRET ?? 'dev-access') as Secret;
const router = Router();

// ===== 업로드 설정 (메모리 → 디스크 저장) =====
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
});

// 안전 파서
function qStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) return qStr(v[0]);
  if (typeof v === "object") return String(v as any);
  return String(v);
}
function qNum(v: unknown): number | undefined {
  const s = qStr(v);
  if (s == null || s.trim() === "") return undefined;
  const n = Number(s);
  return Number.isNaN(n) ? undefined : n;
}
function qBool(v: unknown): boolean | undefined {
  const s = qStr(v)?.toLowerCase();
  if (s == null) return undefined;
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return undefined;
}

// 저장소 보장
function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// 파일 저장 유틸
function savePhotoToDisk(file: Express.Multer.File) {
  const baseDir = path.resolve(process.cwd(), "uploads", "reviews");
  ensureDir(baseDir);
  const ext = (path.extname(file.originalname) || ".jpg").toLowerCase();
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
  const full = path.join(baseDir, name);
  fs.writeFileSync(full, file.buffer);
  // 정적서빙을 /uploads 로 잡았다고 가정 (app.ts: app.use("/uploads", express.static("uploads")))
  const url = `/uploads/reviews/${name}`;
  return { full, url };
}

// ===== 목록 조회 =====
/**
 * GET /api/reviews
 * query:
 *  - q: string (title/content 검색)
 *  - status: 'PUBLISHED' | 'HIDDEN' | 'PENDING'
 *  - rating_min: 1~5
 *  - rating_max: 1~5
 *  - page: number (기본 1)
 *  - page_size: number (기본 20, 최대 100)
 *  - order_by: 'createdAt' | 'rating' (기본 createdAt)
 *  - order_dir: 'ASC' | 'DESC' (기본 DESC)
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      q = "",
      status,
      rating_min,
      rating_max,
      page = "1",
      page_size = "20",
      order_by = "createdAt",
      order_dir = "DESC",
    } = req.query as Record<string, string>;

    const pg = Math.max(parseInt(String(page), 10) || 1, 1);
    const ps = Math.min(Math.max(parseInt(String(page_size), 10) || 20, 1), 100);

    const where: any = {};
    if (status && ["PUBLISHED", "HIDDEN", "PENDING"].includes(status)) {
      where.status = status;
    }
    const rmin = Math.max(1, Math.min(5, Number(rating_min ?? 1)));
    const rmax = Math.max(1, Math.min(5, Number(rating_max ?? 5)));
    if (rmin || rmax) where.rating = { [Op.between]: [Math.min(rmin, rmax), Math.max(rmin, rmax)] };

    if (q && q.trim()) {
      const s = q.trim();
      where[Op.or] = [
        { title: { [Op.like]: `%${s}%` } },
        { content: { [Op.like]: `%${s}%` } },
      ];
    }

    const validOrderBy = ["createdAt", "rating"];
    const by = validOrderBy.includes(order_by) ? order_by : "createdAt";
    const dir = (String(order_dir || "").toUpperCase() === "ASC" ? "ASC" : "DESC") as "ASC" | "DESC";

    const { rows, count } = await Review.findAndCountAll({
      where,
      order: [[by, dir], ["id", "DESC"]],
      offset: (pg - 1) * ps,
      limit: ps,
    });

    return res.json({
      is_success: true,
      items: rows,
      total: count,
      page: pg,
      page_size: ps,
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      is_success: false,
      message: error?.message || "리뷰 목록 조회 중 오류가 발생했습니다.",
    });
  }
});

// ===== 단건 조회 =====
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const idNum = qNum(req.params.id);
    if (!idNum) return res.status(400).json({ is_success: false, message: "유효한 ID가 아닙니다." });

    const item = await Review.findByPk(idNum);
    if (!item) return res.status(404).json({ is_success: false, message: "리뷰가 존재하지 않습니다." });

    return res.json({ is_success: true, item });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      is_success: false,
      message: error?.message || "리뷰 조회 중 오류가 발생했습니다.",
    });
  }
});

// ===== 생성 (multipart/form-data) =====
/**
 * POST /api/reviews
 * form-data:
 *  - title: string (필수)
 *  - content: string (필수)
 *  - rating: number (1~5, 기본 5)
 *  - photo: file? (선택)
 * 동작:
 *  - photo가 있으면 저장하고 photo_url 생성
 *  - reviewer_user_id는 세션 기반이면 req.user?.id 에서 주입 (선택) 
 */
router.post("/", upload.single("photo"), async (req: Request, res: Response) => {
  // auth가 있다면 미들웨어로 앞단에 추가하세요: router.post("/", auth, upload.single(...), ...)
  const t = await sequelize.transaction();
  try {
    const { title, content } = req.body || {};
    // ---- 인증 ----
    const bearer = req.headers.authorization;
    const fromHeader = bearer?.startsWith("Bearer ") ? bearer.split(" ")[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);
    if (!token) {
      return res.status(401).json({ is_success: false, message: "인증 토큰이 필요합니다." });
    }
    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    const user = await User.findByPk(decoded.sub);

    let rating = Number(req.body?.rating ?? 5);
    if (!title || !String(title).trim()) {
      return res.status(400).json({ is_success: false, message: "제목은 필수입니다." });
    }
    if (!content || !String(content).trim()) {
      return res.status(400).json({ is_success: false, message: "내용은 필수입니다." });
    }
    rating = Math.max(1, Math.min(5, Number.isNaN(rating) ? 5 : rating));

    // 첨부 처리
    let photo_url: string | undefined;
    if (req.file) {
      const saved = savePhotoToDisk(req.file);
      photo_url = saved.url;
    }

    // 로그인 유저가 있다면 세팅 (없으면 null)
    const reviewer_user_id = user?.id;

    const item = await Review.create(
      {
        title: String(title).trim(),
        content: String(content).trim(),
        rating,
        photo_url: photo_url ?? null,
        status: "PUBLISHED",
        reviewer_user_id,
      },
      { transaction: t }
    );

    await t.commit();
    return res.json({ is_success: true, item });
  } catch (error: any) {
    await t.rollback();
    console.error(error);
    return res.status(500).json({
      is_success: false,
      message: error?.message || "리뷰 저장 중 오류가 발생했습니다.",
    });
  }
});

// ===== 수정 (텍스트/상태/별점만) =====
/**
 * PUT /api/reviews/:id
 * body:
 *  - title?: string
 *  - content?: string
 *  - rating?: number(1~5)
 *  - status?: 'PUBLISHED' | 'HIDDEN' | 'PENDING'
 */
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const idNum = qNum(req.params.id);
    if (!idNum) return res.status(400).json({ is_success: false, message: "유효한 ID가 아닙니다." });

    const found = await Review.findByPk(idNum);
    if (!found) return res.status(404).json({ is_success: false, message: "수정 대상 리뷰가 존재하지 않습니다." });

    const patch: any = {};
    if (req.body.title != null) patch.title = String(req.body.title).trim();
    if (req.body.content != null) patch.content = String(req.body.content).trim();
    if (req.body.rating != null) {
      const r = Math.max(1, Math.min(5, Number(req.body.rating)));
      if (!Number.isFinite(r)) return res.status(400).json({ is_success: false, message: "별점은 1~5 사이여야 합니다." });
      patch.rating = r;
    }
    if (req.body.status && ["PUBLISHED", "HIDDEN", "PENDING"].includes(req.body.status)) {
      patch.status = req.body.status;
    }

    await found.update(patch);
    return res.json({ is_success: true, item: found });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      is_success: false,
      message: error?.message || "리뷰 수정 중 오류가 발생했습니다.",
    });
  }
});

// ===== 사진만 교체 =====
/**
 * POST /api/reviews/:id/photo
 * form-data: photo(file)
 */
router.post("/:id/photo", upload.single("photo"), async (req: Request, res: Response) => {
  try {
    const idNum = qNum(req.params.id);
    if (!idNum) return res.status(400).json({ is_success: false, message: "유효한 ID가 아닙니다." });

    const found = await Review.findByPk(idNum);
    if (!found) return res.status(404).json({ is_success: false, message: "리뷰가 존재하지 않습니다." });
    if (!req.file) return res.status(400).json({ is_success: false, message: "첨부 파일이 없습니다." });

    const saved = savePhotoToDisk(req.file);
    await found.update({ photo_url: saved.url });

    return res.json({ is_success: true, item: found });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      is_success: false,
      message: error?.message || "사진 교체 중 오류가 발생했습니다.",
    });
  }
});

// ===== 삭제 =====
/**
 * DELETE /api/reviews/:id?force=0|1
 * - 기본 soft delete, force=1 이면 물리 삭제
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const idNum = qNum(req.params.id);
    if (!idNum) return res.status(400).json({ is_success: false, message: "유효한 ID가 아닙니다." });

    const force = qBool(req.query.force) === true;

    const found = await Review.findByPk(idNum);
    if (!found) return res.status(404).json({ is_success: false, message: "삭제 대상 리뷰가 존재하지 않습니다." });

    await found.destroy({ force });
    return res.json({ is_success: true });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      is_success: false,
      message: error?.message || "리뷰 삭제 중 오류가 발생했습니다.",
    });
  }
});

export default router;
