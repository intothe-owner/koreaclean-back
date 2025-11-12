// src/routes/companies.ts
import { Router, Request, Response } from 'express';
import { Op, WhereOptions, where as whereFn, literal } from 'sequelize';
const { Company, sequelize } = require('../../models');

const router = Router();

/** "시도>구군" → {sido,gugun} */
function splitKey(key: string): { sido: string; gugun: string } {
  const i = key.indexOf('>');
  if (i < 0) return { sido: key.trim(), gugun: '' };
  return { sido: key.slice(0, i).trim(), gugun: key.slice(i + 1).trim() };
}

/**
 * GET /api/companies
 *  - status: 'APPROVED' | 'PENDING' | 'REJECTED'
 *  - q: 업체명/대표명 키워드
 *  - regions: "시도>구군" (다중)  ex) ?regions=부산>해운대구&regions=부산>수영구
 *  - page, size: 페이지네이션 (기본 1, 20)
 *
 * 응답: { rows: CompanyItem[], count: number }
 *   - CompanyItem.regions: [{sido,gugun}]
 */
router.get('/companies', async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const size = Math.min(100, Number(req.query.size ?? 20) || 20);

    const regionsQ = req.query.regions;
    const regionKeys: string[] = Array.isArray(regionsQ)
      ? (regionsQ as string[])
      : typeof regionsQ === 'string'
      ? [regionsQ]
      : [];

    // ✅ [Op.or]을 객체 리터럴에 한 번에 넣어서 TS 오류 피하기
    const baseWhere: WhereOptions = {
      ...(status && ['APPROVED', 'PENDING', 'REJECTED'].includes(status) ? { status } : {}),
      ...(q
        ? {
            [Op.or]: [
              { name: { [Op.like]: `%${q}%` } },
              { ceo:  { [Op.like]: `%${q}%` } },
            ],
          }
        : {}),
    };

    // ✅ regions: JSON 배열(문자열 요소) → 정확 일치 필터
    //    JSON_CONTAINS(regions, '"부산>해운대구"', '$') = 1
    //    안전한 이스케이프: JSON.stringify + sequelize.escape 로 처리
    const regionOrConds =
      regionKeys.length > 0
        ? regionKeys.map((key) => {
            const jsonNeedle = sequelize.escape(JSON.stringify(key)); // => '"부산>해운대구"' 형태로 쿼리에 안전하게 삽입
            return whereFn(
              literal(`JSON_CONTAINS(\`company\`.\`regions\`, ${jsonNeedle}, '$')`),
              1
            );
          })
        : [];

    const finalWhere: WhereOptions =
      regionOrConds.length > 0
        ? { [Op.and]: [baseWhere, { [Op.or]: regionOrConds }] }
        : baseWhere;

    const { rows, count } = await Company.findAndCountAll({
      where: finalWhere,
      order: [['id', 'DESC']],
      offset: (page - 1) * size,
      limit: size,
    });

    // 프런트 포맷으로 매핑 (regions: string[] → {sido,gugun}[])
    const mapped = rows.map((c: any) => ({
      id: Number(c.id),
      name: String(c.name ?? ''),
      ceo: String(c.ceo ?? ''),
      address: String(c.address ?? ''),
      tel: String(c.tel ?? ''),
      lat: c.lat == null ? null : Number(c.lat),
      lng: c.lng == null ? null : Number(c.lng),
      homepage: c.homepage ?? null,
      status: c.status ?? 'PENDING',
      regions: Array.isArray(c.regions)
        ? c.regions
            .map((s: any) => {
              if (typeof s !== 'string') return null;
              const { sido, gugun } = splitKey(s);
              return sido ? { sido, gugun } : null;
            })
            .filter(Boolean)
        : [],
    }));

    return res.json({ rows: mapped, count });
  } catch (e: any) {
    console.error('GET /api/companies error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
