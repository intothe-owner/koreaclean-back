// routes/admin/site.ts
import { Router, Request, Response } from "express";
import dotenv from "dotenv";
dotenv.config();

const { Faq } = require("../../models");

const router = Router();

/** 고정 카테고리 검증 */
const CATEGORY_OPTIONS = ["홈페이지관련", "회원관련", "서비스신청관련", "업체관련"] as const;
type Category = (typeof CATEGORY_OPTIONS)[number];
function isValidCategory(v: any): v is Category {
  return CATEGORY_OPTIONS.includes(v);
}

/**
 * GET /faqs
 * 쿼리:
 *  - q: string (질문/답변/카테고리 검색)
 *  - category: Category
 *  - is_active: '0' | '1'
 *  - page: number (기본 1)
 *  - page_size: number (기본 20)
 *  - order_by: 'order_no' | 'createdAt' | 'updatedAt' (기본 order_no)
 *  - order_dir: 'ASC' | 'DESC' (기본 ASC; order_no는 ASC가 일반적)
 */
router.get("/faqs", async (req: Request, res: Response) => {
  try {
    const {
      q = "",
      category,
      is_active,
      page = "1",
      page_size = "20",
      order_by = "order_no",
      order_dir = "ASC",
    } = req.query as Record<string, string>;

    const pg = Math.max(parseInt(String(page), 10) || 1, 1);
    const ps = Math.min(Math.max(parseInt(String(page_size), 10) || 20, 1), 100);

    // where 구성
    const where: any = {};
    if (category && isValidCategory(category)) {
      where.category = category;
    }
    if (is_active === "0" || is_active === "1") {
      where.is_active = is_active === "1";
    }
    if (q && q.trim()) {
      const { Op } = require("sequelize");
      const s = q.trim();
      where[Op.or] = [
        { question: { [Op.like]: `%${s}%` } },
        { answer: { [Op.like]: `%${s}%` } },
        { category: { [Op.like]: `%${s}%` } },
      ];
    }

    // 정렬 구성
    const validOrderBy = ["order_no", "createdAt", "updatedAt"];
    const by = validOrderBy.includes(order_by) ? order_by : "order_no";
    const dir = (String(order_dir || "").toUpperCase() === "DESC" ? "DESC" : "ASC") as "ASC" | "DESC";

    const offset = (pg - 1) * ps;

    const { rows, count } = await Faq.findAndCountAll({
      where,
      order: [[by, dir], ["id", "DESC"]], // 동일정렬 보조키
      offset,
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
      message: error?.message || "FAQ 목록 조회 중 오류가 발생했습니다.",
    });
  }
});

/**
 * POST /save
 * body:
 *  - id?: number  (있으면 수정, 없으면 생성)
 *  - category: Category (필수)
 *  - question: string (필수)
 *  - answer: string (필수)
 *  - is_active?: boolean (기본 true)
 *  - order_no?: number | null
 */
router.post("/save", async (req: Request, res: Response) => {
  try {
    const { id, category, question, answer, is_active = true, order_no } = req.body || {};

    // 필수값 검증
    if (!isValidCategory(category)) {
      return res.status(400).json({ is_success: false, message: "유효한 카테고리가 아닙니다." });
    }
    if (!question || !String(question).trim()) {
      return res.status(400).json({ is_success: false, message: "질문은 필수입니다." });
    }
    if (!answer || !String(answer).trim()) {
      return res.status(400).json({ is_success: false, message: "답변은 필수입니다." });
    }

    const payload: any = {
      category,
      question: String(question).trim(),
      answer: String(answer).trim(),
      is_active: !!is_active,
      order_no:
        order_no === null || order_no === undefined || Number.isNaN(Number(order_no))
          ? null
          : Number(order_no),
    };

    let item;
    if (id) {
      // 수정
      const found = await Faq.findByPk(id);
      if (!found) {
        return res.status(404).json({ is_success: false, message: "대상 FAQ가 존재하지 않습니다." });
      }
      await found.update(payload);
      item = found;
    } else {
      // 생성
      item = await Faq.create(payload);
    }

    return res.json({ is_success: true, item });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      is_success: false,
      message: error?.message || "FAQ 저장 중 오류가 발생했습니다.",
    });
  }
});
router.delete("/faqs/:id", async (req, res) => {
  try {
    const idNum = qNum(req.params.id);
    if (!idNum) {
      return res.status(400).json({ is_success: false, message: "유효한 ID가 아닙니다." });
    }

    const force = qBool(req.query.force) === true;

    const found = await Faq.findByPk(idNum);
    if (!found) {
      return res.status(404).json({ is_success: false, message: "삭제 대상 FAQ가 존재하지 않습니다." });
    }

    await found.destroy({ force });
    return res.json({ is_success: true });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      is_success: false,
      message: error?.message || "FAQ 삭제 중 오류가 발생했습니다.",
    });
  }
});
// 안전 파서
function qStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) return qStr(v[0]);
  if (typeof v === "object") return String(v as any); // ParsedQs -> toString
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

export default router;
