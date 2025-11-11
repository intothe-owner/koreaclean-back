// routes/admin/site.ts
import { Router, Request, Response } from "express";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import path from "path";
import { Op } from "sequelize";
dotenv.config();

const { Notice } = require("../../models");

const router = Router();

/* ------------------ 업로드 설정 ------------------ */
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "notice");

// 폴더 보장
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDir(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^\w.-]/g, "_");
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});
const upload = multer({ storage });

/* 파일 URL 생성 (정적서빙 기준)
   - 서버에서 app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))
   - 예: http(s)://your-domain.com/uploads/notice/<filename> */
function makeFileURL(filename: string) {
  const base = process.env.STATIC_BASE_URL || ""; // 필요시 .env로 도메인 지정
  // base 비면 상대경로(/uploads/notice/...)만 반환
  return `${base}/uploads/notice/${filename}`;
}

/* ------------------ 공지 저장 ------------------
   FormData 필드:
   - id?                : number (수정 시)
   - title              : string
   - content            : string (HTML/텍스트)
   - priority           : 'EMERGENCY' | 'IMPORTANT' | 'NORMAL'
   - is_pinned          : 'Y' | 'N'
   - attachments_meta?  : stringified JSON (기존 첨부 유지용)
   - files[]            : 업로드 파일들
------------------------------------------------- */
router.post("/save", upload.array("files", 10), async (req: Request, res: Response) => {
  try {
    const {
      id,
      title,
      content,
      priority = "NORMAL",
      is_pinned = "N",
      attachments_meta,
    } = req.body as {
      id?: string;
      title: string;
      content: string;
      priority?: "EMERGENCY" | "IMPORTANT" | "NORMAL";
      is_pinned?: "Y" | "N";
      attachments_meta?: string;
    };

    if (!title || !content) {
      return res.status(400).json({ is_success: false, message: "title, content는 필수입니다." });
    }

    // 기존 첨부(수정 시 유지) 파싱
    let existing: any[] = [];
    if (attachments_meta) {
      try {
        const parsed = JSON.parse(attachments_meta);
        if (Array.isArray(parsed)) existing = parsed;
      } catch {
        // ignore 잘못된 JSON
      }
    }

    // 새 업로드 파일들을 첨부 메타로 변환
    const uploaded = (req.files as Express.Multer.File[] | undefined)?.map((f) => {
      const filename = path.basename(f.path);
      return {
        name: f.originalname,
        url: makeFileURL(filename),           // 정적서빙 URL
        path: `/uploads/notice/${filename}`,  // 서버 상대 경로(선택)
        size: f.size,
        mime: f.mimetype,
      };
    }) ?? [];

    const attachments = [...existing, ...uploaded];

    // 생성/수정 분기
    if (id) {
      const row = await Notice.findByPk(id);
      if (!row) return res.status(404).json({ is_success: false, message: "해당 공지를 찾을 수 없습니다." });

      await row.update({
        title,
        content,
        priority,
        is_pinned: is_pinned === "Y",
        attachments,
      });

      return res.json({ is_success: true, id: row.id });
    } else {
      const row = await Notice.create({
        title,
        content,
        priority,
        is_pinned: is_pinned === "Y",
        attachments,
        views: 0,
      });
      return res.json({ is_success: true, id: row.id });
    }
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ is_success: false, message: err?.message || "서버 오류" });
  }
});

/* ------------------ 공지 목록 ------------------
   Query:
   - q?          : string (제목/내용 LIKE)
   - priority?   : 'EMERGENCY' | 'IMPORTANT' | 'NORMAL'
   - page?       : number (default 1)
   - page_size?  : number (default 10)
   - order_by?   : 'createdAt' | 'title' | 'views' | 'priority' | 'is_pinned' (default 'createdAt')
   - order_dir?  : 'ASC' | 'DESC' (default 'DESC')
------------------------------------------------- */
router.get("/list", async (req: Request, res: Response) => {
  try {
    const {
      q = "",
      priority,
      page = "1",
      page_size = "10",
      order_by = "createdAt",
      order_dir = "DESC",
    } = req.query as Record<string, string>;

    const pageNum = Math.max(parseInt(page || "1", 10) || 1, 1);
    const pageSizeNum = Math.min(Math.max(parseInt(page_size || "10", 10) || 10, 1), 100);

    // where 조건
    const where: any = {};
    if (priority && ["EMERGENCY", "IMPORTANT", "NORMAL"].includes(priority)) {
      where.priority = priority;
    }
    if (q) {
      where[Op.or] = [
        { title: { [Op.like]: `%${q}%` } },
        { content: { [Op.like]: `%${q}%` } },
      ];
    }

    // 정렬
    const ALLOW_ORDER = new Set(["createdAt", "title", "views", "priority", "is_pinned"]);
    const orderBy = ALLOW_ORDER.has(order_by) ? order_by : "createdAt";
    const orderDir = order_dir?.toUpperCase() === "ASC" ? "ASC" : "DESC";

    const { rows, count } = await Notice.findAndCountAll({
      where,
      order: [
        // 상단 고정 먼저 보여주고 싶다면 여기에 추가
        ["is_pinned", "DESC"],
        [orderBy, orderDir],
      ],
      offset: (pageNum - 1) * pageSizeNum,
      limit: pageSizeNum,
      attributes: ["id", "title", "priority", "is_pinned", "views", "createdAt", "updatedAt"], // 목록에 필요한 필드만
    });

    return res.json({
      is_success: true,
      items: rows,
      total: count,
      page: pageNum,
      page_size: pageSizeNum,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ is_success: false, message: err?.message || "서버 오류" });
  }
});
router.post("/delete", async (req: Request, res: Response) => {
  try {
    const id = (req.query.id as string) || (req.body?.id as string);
    if (!id) return res.status(400).json({ is_success: false, message: "id가 필요합니다." });

    const row = await Notice.findByPk(id);
    if (!row) return res.status(404).json({ is_success: false, message: "해당 공지를 찾을 수 없습니다." });

    // 필요시 물리 파일 삭제 로직을 넣을 수 있습니다.
    // if (process.env.REMOVE_FILES_ON_DELETE === "true" && Array.isArray(row.attachments)) {
    //   try { for (const f of row.attachments) fs.unlinkSync(path.join(process.cwd(), f.path)); } catch {}
    // }

    await row.destroy(); // paranoid: true 이면 soft delete
    return res.json({ is_success: true });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ is_success: false, message: err?.message || "서버 오류" });
  }
});
router.get("/detail", async (req: Request, res: Response) => {
  try {
    const id = req.query.id as string;
    const incView = req.query.inc_view === "1";

    if (!id) {
      return res.status(400).json({ is_success: false, message: "id가 필요합니다." });
    }

    const row = await Notice.findByPk(id, {
      // 상세에 필요한 필드 모두 반환
      attributes: [
        "id",
        "title",
        "content",
        "priority",
        "is_pinned",
        "attachments",
        "views",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ],
      // paranoid: true 가 기본이라 삭제된 건 조회 안 됨 (원하면 paranoid: false로 바꾼 뒤 체크)
    });

    if (!row) {
      return res.status(404).json({ is_success: false, message: "해당 공지를 찾을 수 없습니다." });
    }

    // 조회수 증가 옵션
    if (incView) {
      await row.increment("views", { by: 1 });
      await row.reload(); // 최신값 반영
    }

    return res.json({
      is_success: true,
      item: row, // Sequelize가 JSON 컬럼(attachments)을 객체로 반환
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ is_success: false, message: err?.message || "서버 오류" });
  }
});
export default router;
