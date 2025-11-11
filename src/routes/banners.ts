// routes/admin/site.ts
import { Router, Request, Response } from "express";
import dotenv from "dotenv";
dotenv.config();

const { MainBanner, sequelize } = require("../../models");

const router = Router();

/** 저장 가능한 컬럼 화이트리스트 */
const UPDATABLE_FIELDS = [
  "image_url","title","subtitle","link_url",
  "order_no","is_active",
  "alignX","alignY","textAlign","overlayZ",
  "titleSize","titleWeight","titleColor",
  "subtitleSize","subtitleWeight","subtitleColor",
  "fontFamily",
  "boxBg","boxBlur","boxOpacity","boxRounded","boxPaddingX","boxPaddingY","boxShadow",
  "animType","animDurationMs","animDelayMs",
  "bgAnimType","bgAnimDurationMs","bgAnimDelayMs",
] as const;
type UpdatableKey = (typeof UPDATABLE_FIELDS)[number];
const pickSlide = (input: any): Record<UpdatableKey, any> => {
  const out: any = {};
  for (const k of UPDATABLE_FIELDS) if (Object.prototype.hasOwnProperty.call(input, k)) out[k] = input[k];
  return out;
};

/** ================================
 *  저장 (이미 구현되어 있던 부분)
 *  POST /admin/site/save
 *  body: { slides: SlideItem[] }
 *  ================================ */
router.post("/save", async (req: Request, res: Response) => {
  const { slides } = req.body || {};
  if (!Array.isArray(slides)) {
    return res.status(400).json({ is_success: false, message: "slides 배열이 필요합니다." });
  }

  const normalized = slides
    .map((s: any, i: number) => ({
      ...s,
      order_no: typeof s.order_no === "number" ? s.order_no : i + 1,
      is_active: typeof s.is_active === "boolean" ? s.is_active : true,
    }))
    .sort((a: any, b: any) => a.order_no - b.order_no)
    .map((s: any, i: number) => ({ ...s, order_no: i + 1 }));

  for (const [i, s] of normalized.entries()) {
    if (!s.image_url || typeof s.image_url !== "string") {
      return res.status(400).json({ is_success: false, message: `slides[${i}].image_url 이(가) 필요합니다.` });
    }
  }

  const t = await sequelize.transaction();
  try {
    const existing = await MainBanner.findAll({ attributes: ["id"], transaction: t });
    const existingIds: number[] = existing.map((r: any) => r.id);
    const incomingIds: number[] = normalized.map((s: any) => s.id).filter((id: any) => typeof id === "number");
    const toDelete = existingIds.filter((id) => !incomingIds.includes(id));

    if (toDelete.length > 0) {
      await MainBanner.destroy({ where: { id: toDelete }, transaction: t });
    }

    const rows = normalized.map((s: any) => {
      const row = pickSlide(s);
      if (typeof s.id === "number") (row as any).id = s.id;
      return row;
    });

    await MainBanner.bulkCreate(rows, {
      updateOnDuplicate: [...UPDATABLE_FIELDS],
      transaction: t,
    });

    await t.commit();
    return res.json({ is_success: true, message: "메인 배너가 저장되었습니다.", count: rows.length });
  } catch (err: any) {
    await t.rollback();
    console.error("[/admin/site/save] error:", err);
    return res.status(500).json({ is_success: false, message: err?.message || "저장 중 오류가 발생했습니다." });
  }
});

/** ================================
 *  관리자용 목록 조회
 *  GET /admin/site/list
 *  쿼리:
 *    - onlyActive=1        노출 중만
 *    - q=검색어            제목/부제/링크 URL like 검색
 *    - limit=50, offset=0  페이지네이션
 *    - order=asc|desc      order_no 정렬방향 (기본 asc)
 *  ================================ */
router.get("/list", async (req: Request, res: Response) => {
  try {
    const onlyActive = req.query.onlyActive === "1" || req.query.onlyActive === "true";
    const q = (req.query.q as string)?.trim();
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt((req.query.offset as string) || "0") || 0;
    const orderDir = (req.query.order as string)?.toLowerCase() === "desc" ? "DESC" : "ASC";

    const where: any = {};
    if (onlyActive) where.is_active = true;

    // 간단 검색: title/subtitle/link_url LIKE
    if (q) {
      const { Op } = require("sequelize");
      where[Op.or] = [
        { title: { [Op.like]: `%${q}%` } },
        { subtitle: { [Op.like]: `%${q}%` } },
        { link_url: { [Op.like]: `%${q}%` } },
      ];
    }

    const { rows, count } = await MainBanner.findAndCountAll({
      where,
      order: [
        ["order_no", orderDir],
        ["id", "ASC"],
      ],
      limit,
      offset,
    });

    return res.json({
      is_success: true,
      total: count,
      limit,
      offset,
      items: rows,
    });
  } catch (err: any) {
    console.error("[/admin/site/list] error:", err);
    return res.status(500).json({ is_success: false, message: err?.message || "조회 중 오류가 발생했습니다." });
  }
});

/** ================================
 *  관리자용 단건 조회
 *  GET /admin/site/:id
 *  ================================ */
router.get("/site/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ is_success: false, message: "유효하지 않은 id 입니다." });
    }
    const row = await MainBanner.findByPk(id);
    if (!row) {
      return res.status(404).json({ is_success: false, message: "배너를 찾을 수 없습니다." });
    }
    return res.json({ is_success: true, item: row });
  } catch (err: any) {
    console.error("[/admin/site/:id] error:", err);
    return res.status(500).json({ is_success: false, message: err?.message || "조회 중 오류가 발생했습니다." });
  }
});
router.get("/main-banners", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const items = await MainBanner.findAll({
      where: { is_active: true },
      order: [
        ["order_no", "ASC"],
        ["id", "ASC"],
      ],
      limit,
    });

    // 선택: 캐시 헤더(프론트 홈 배너는 캐시해도 무방한 경우가 많음)
    const cacheSec = parseInt(req.query.cacheSec as string) || 0;
    if (cacheSec > 0) {
      res.setHeader("Cache-Control", `public, max-age=${cacheSec}, s-maxage=${cacheSec}`);
    }

    return res.json({
      is_success: true,
      items,
    });
  } catch (err: any) {
    console.error("[/site/main-banners] error:", err);
    return res.status(500).json({ is_success: false, message: err?.message || "조회 중 오류가 발생했습니다." });
  }
});
export default router;
