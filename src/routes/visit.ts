// routes/visit.ts
import { Router, Request, Response } from 'express';
const { VisitStat, sequelize } = require('../../models');
const { Op } = require('sequelize');

const router = Router();

/** 오늘 날짜를 YYYY-MM-DD 형태로 리턴 */
function todayDateOnly() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 방문 기록 저장
 * POST /api/visit/track
 * body: { path?: string, stat_date?: string(YYYY-MM-DD) }
 */
router.post('/track', async (req: Request, res: Response) => {
  try {
    let { path, stat_date } = req.body || {};

    if (!path || typeof path !== 'string') {
      path = '/';
    }
    if (!stat_date || typeof stat_date !== 'string') {
      stat_date = todayDateOnly();
    }

    const result = await sequelize.transaction(async (t: any) => {
      // 먼저 view_count + 1 시도
      const [affected] = await VisitStat.update(
        { view_count: sequelize.literal('view_count + 1') },
        { where: { stat_date, path }, transaction: t }
      );

      if (affected === 0) {
        // 없으면 새로 생성
        return await VisitStat.create(
          { stat_date, path, view_count: 1 },
          { transaction: t }
        );
      }

      // 다시 읽어서 리턴
      const row = await VisitStat.findOne({
        where: { stat_date, path },
        transaction: t,
      });
      return row;
    });

    return res.json({ ok: true, stat: result });
  } catch (err) {
    console.error('[visit.track] error', err);
    return res.status(500).json({
      ok: false,
      message: '방문 통계 저장 중 오류가 발생했습니다.',
    });
  }
});

/**
 * 특정 날짜의 페이지별 통계 조회
 * GET /api/visit/daily?date=2025-11-17
 */
router.get('/daily', async (req: Request, res: Response) => {
  try {
    const q = req.query.date;
    const stat_date =
      typeof q === 'string' && q.trim().length > 0 ? q : todayDateOnly();

    const rows = await VisitStat.findAll({
      where: { stat_date },
      order: [['view_count', 'DESC']],
    });

    return res.json({ ok: true, items: rows });
  } catch (err) {
    console.error('[visit.daily] error', err);
    return res.status(500).json({
      ok: false,
      message: '일별 방문 통계 조회 중 오류가 발생했습니다.',
    });
  }
});

/**
 * 기간 + path별 통계 (간단 합계)
 * GET /api/visit/range?from=2025-11-01&to=2025-11-30&path=/service-request
 * - path 생략 시 전체 합계
 */
router.get('/range', async (req: Request, res: Response) => {
  try {
    const { from, to, path } = req.query as {
      from?: string;
      to?: string;
      path?: string;
    };

    const where: any = {};
    if (from || to) {
      where.stat_date = {};
      if (from) where.stat_date[Op.gte] = from;
      if (to) where.stat_date[Op.lte] = to;
    }
    if (path) {
      where.path = path;
    }

    const rows = await VisitStat.findAll({
      where,
      order: [
        ['path', 'ASC'],
        ['stat_date', 'ASC'],
      ],
    });

    return res.json({ ok: true, items: rows });
  } catch (err) {
    console.error('[visit.range] error', err);
    return res.status(500).json({
      ok: false,
      message: '기간 방문 통계 조회 중 오류가 발생했습니다.',
    });
  }
});

export default router;
