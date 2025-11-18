// routes/edu.ts  (교육 공지 라우터)
import { Router, Request, Response } from "express";
import dotenv from "dotenv";
import multer from "multer";
import { Op } from "sequelize";

dotenv.config();

const { EduNotice } = require("../../models");

const router = Router();

// ===== multer 설정 (폼데이터 + 파일용) =====
const upload = multer({
  storage: multer.memoryStorage(), // 필요하면 diskStorage로 교체
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

/* =========================
 *  유틸
 * ========================= */
function parseIntSafe(v: any, def: number): number {
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? def : n;
}

function sanitizeOrderBy(v: any): "createdAt" | "title" | "edu_start_date" {
  if (v === "title" || v === "edu_start_date") return v;
  return "createdAt";
}

function sanitizeOrderDir(v: any): "ASC" | "DESC" {
  return String(v).toUpperCase() === "ASC" ? "ASC" : "DESC";
}

/* =========================
 *  목록 조회
 *  GET /admin/edu-notice
 *  query: q, page, page_size, order_by, order_dir
 * ========================= */
router.get(
  "/admin/edu-notice",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { q, page, page_size, order_by, order_dir } = req.query;

      const pageNum = parseIntSafe(page, 1);
      const pageSize = parseIntSafe(page_size, 10);

      const where: any = {};
      if (q && String(q).trim() !== "") {
        const keyword = `%${String(q).trim()}%`;
        where[Op.or] = [
          { title: { [Op.like]: keyword } },
          { content: { [Op.like]: keyword } },
        ];
      }

      const orderBy = sanitizeOrderBy(order_by);
      const orderDir = sanitizeOrderDir(order_dir);

      const { rows, count } = await EduNotice.findAndCountAll({
        where,
        order: [[orderBy, orderDir]],
        offset: (pageNum - 1) * pageSize,
        limit: pageSize,
      });

      res.json({
        total: count,
        items: rows,
      });
    } catch (err: any) {
      console.error("GET /admin/edu-notice error:", err);
      res
        .status(500)
        .json({ message: err?.message || "교육 공지 목록 조회에 실패했습니다." });
    }
  }
);

/* =========================
 *  상세 조회
 *  GET /admin/edu-notice/:id
 * ========================= */
router.get(
  "/admin/edu-notice/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const item = await EduNotice.findByPk(id);
      if (!item) {
        res
          .status(404)
          .json({ message: "해당 교육 공지를 찾을 수 없습니다." });
        return;
      }

      // 프론트에서는 { item } 구조를 기대
      res.json({ item });
    } catch (err: any) {
      console.error("GET /admin/edu-notice/:id error:", err);
      res
        .status(500)
        .json({ message: err?.message || "교육 공지 상세 조회에 실패했습니다." });
    }
  }
);

/* =========================
 *  등록
 *  POST /admin/edu-notice
 *  body: FormData (title, content, edu_start_date, edu_end_date,
 *                  class_start_time, class_end_time, attachments(JSON),
 *                  files[])
 * ========================= */
router.post(
  "/admin/edu-notice",
  upload.array("files", 10),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        title,
        content,
        edu_start_date,
        edu_end_date,
        class_start_time,
        class_end_time,
        attachments,
      } = req.body as {
        title: string;
        content: string;
        edu_start_date: string;
        edu_end_date: string;
        class_start_time: string;
        class_end_time: string;
        attachments?: string;
      };
      console.log(req.body);
      if (!title || !title.trim()) {
        res.status(400).json({ message: "제목은 필수입니다." });
        return;
      }
      if (!edu_start_date || !edu_end_date) {
        res.status(400).json({ message: "교육 시작일/종료일은 필수입니다." });
        return;
      }
      if (!class_start_time || !class_end_time) {
        res.status(400).json({ message: "수업 시작/종료 시간은 필수입니다." });
        return;
      }
      if (!content || !content.trim()) {
        res.status(400).json({ message: "내용은 필수입니다." });
        return;
      }

      // 기존 첨부 (프론트에서 JSON 문자열로 전달)
      let attList: any[] = [];
      if (attachments) {
        try {
          const parsed = JSON.parse(attachments);
          if (Array.isArray(parsed)) attList = parsed;
        } catch (e) {
          console.warn("attachments JSON parse error:", e);
        }
      }

      // 새 파일 메타 추가
      const files = req.files as Express.Multer.File[] | undefined;
      if (files && files.length > 0) {
        const newFiles = files.map((f) => ({
          name: f.originalname,
          size: f.size,
          // TODO: 실제 파일 업로드 후 URL을 넣어주세요.
          // 예: url: await uploadToS3(f.buffer, f.originalname)
        }));
        attList = [...attList, ...newFiles];
      }

      const created = await EduNotice.create({
        title: title.trim(),
        content: content.trim(),
        edu_start_date,
        edu_end_date,
        class_start_time,
        class_end_time,
        attachments: attList,
      });

      res.json({
        is_success: true,
        item: created,
      });
    } catch (err: any) {
      console.error("POST /admin/edu-notice error:", err);
      res
        .status(500)
        .json({ message: err?.message || "교육 공지 등록에 실패했습니다." });
    }
  }
);

/* =========================
 *  수정
 *  PUT /admin/edu-notice/:id
 *  body: FormData (등록과 동일)
 * ========================= */
router.put(
  "/admin/edu-notice/:id",
  upload.array("files", 10),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const {
        title,
        content,
        edu_start_date,
        edu_end_date,
        class_start_time,
        class_end_time,
        attachments,
      } = req.body as {
        title: string;
        content: string;
        edu_start_date: string;
        edu_end_date: string;
        class_start_time: string;
        class_end_time: string;
        attachments?: string;
      };

      const item = await EduNotice.findByPk(id);
      if (!item) {
        res
          .status(404)
          .json({ message: "해당 교육 공지를 찾을 수 없습니다." });
        return;
      }

      if (!title || !title.trim()) {
        res.status(400).json({ message: "제목은 필수입니다." });
        return;
      }
      if (!edu_start_date || !edu_end_date) {
        res.status(400).json({ message: "교육 시작일/종료일은 필수입니다." });
        return;
      }
      if (!class_start_time || !class_end_time) {
        res.status(400).json({ message: "수업 시작/종료 시간은 필수입니다." });
        return;
      }
      if (!content || !content.trim()) {
        res.status(400).json({ message: "내용은 필수입니다." });
        return;
      }

      // 남겨진 기존 첨부들
      let attList: any[] = [];
      if (attachments) {
        try {
          const parsed = JSON.parse(attachments);
          if (Array.isArray(parsed)) attList = parsed;
        } catch (e) {
          console.warn("attachments JSON parse error:", e);
        }
      }

      // 새 파일 메타 추가
      const files = req.files as Express.Multer.File[] | undefined;
      if (files && files.length > 0) {
        const newFiles = files.map((f) => ({
          name: f.originalname,
          size: f.size,
          // TODO: 실제 파일 업로드 후 URL을 넣어주세요.
        }));
        attList = [...attList, ...newFiles];
      }

      await item.update({
        title: title.trim(),
        content: content.trim(),
        edu_start_date,
        edu_end_date,
        class_start_time,
        class_end_time,
        attachments: attList,
      });

      res.json({
        is_success: true,
        item,
      });
    } catch (err: any) {
      console.error("PUT /admin/edu-notice/:id error:", err);
      res
        .status(500)
        .json({ message: err?.message || "교육 공지 수정에 실패했습니다." });
    }
  }
);

/* =========================
 *  삭제
 *  DELETE /admin/edu-notice/:id
 * ========================= */
router.delete(
  "/admin/edu-notice/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const item = await EduNotice.findByPk(id);
      if (!item) {
        res.status(404).json({
          is_success: false,
          message: "해당 교육 공지를 찾을 수 없습니다.",
        });
        return;
      }

      // paranoid: true 이면 soft delete, 아니면 물리 삭제
      await item.destroy();

      res.json({
        is_success: true,
      });
    } catch (err: any) {
      console.error("DELETE /admin/edu-notice/:id error:", err);
      res.status(500).json({
        is_success: false,
        message: err?.message || "교육 공지 삭제에 실패했습니다.",
      });
    }
  }
);

export default router;
