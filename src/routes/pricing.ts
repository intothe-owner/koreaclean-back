// routes/admin/site.ts
import { Router, Request, Response } from "express";
import dotenv from "dotenv";

dotenv.config();

const router = Router();
// models 가져오기 (sequelize 인스턴스도 필요시 사용)
const { ServicePricing, sequelize } = require("../../models");

// 서비스 키 고정 (ENUM과 동일해야 함)
const KEYS = ["totalCare", "generalCleaning", "disinfection", "acDeepClean", "etc"] as const;
type ServiceKey = typeof KEYS[number];

// 값 검증 헬퍼
function isValidPrice(v: unknown) {
  return Number.isInteger(v) && (v as number) >= 0;
}

// 사이트 정보 저장 (요금표 저장 포함)
router.post("/save", async (req: Request, res: Response) => {
  try {
    // 바디에서 pricing 객체를 꺼내거나, 평평한 키 구조를 그대로 사용
    const payload = (req.body?.pricing && typeof req.body.pricing === "object")
      ? req.body.pricing
      : req.body || {};

    // 1) 검증
    for (const k of KEYS) {
      const v = payload[k];
      if (v == null) continue; // 안보낸 항목은 건너뜀(부분 업데이트 허용)
      if (!isValidPrice(v)) {
        return res.status(400).json({
          is_success: false,
          message: `${k} 값이 올바르지 않습니다. (0 이상의 정수)`,
        });
      }
    }

    // 2) 트랜잭션으로 upsert (service_key 별 1행 유지)
    const t = await sequelize.transaction();
    try {
      for (const k of KEYS) {
        const v = payload[k];
        if (v == null) continue;

        // 있으면 update, 없으면 create
        const [row, created] = await ServicePricing.findOrCreate({
          where: { service_key: k },
          defaults: { price_krw: v },
          transaction: t,
        });

        if (!created) {
          await row.update({ price_krw: v }, { transaction: t });
        }
      }

      await t.commit();
      return res.json({ is_success: true, message: "요금표가 저장되었습니다." });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ is_success: false, message: "서버 오류" });
  }
});
router.get("/pricing", async (req: Request, res: Response) => {
  try {
    const rows = await ServicePricing.findAll({
      // 필요 시 정렬
      order: [["service_key", "ASC"]],
    });

    // service_key -> price_krw 맵
    const pricing: Record<ServiceKey, number> = {
      totalCare: 0,
      generalCleaning: 0,
      disinfection: 0,
      acDeepClean: 0,
      etc: 0,
    };

    for (const r of rows) {
      if (KEYS.includes(r.service_key)) {
        pricing[r.service_key as ServiceKey] = r.price_krw ?? 0;
      }
    }

    return res.json({ is_success: true, pricing });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ is_success: false, message: "서버 오류" });
  }
});
export default router;
