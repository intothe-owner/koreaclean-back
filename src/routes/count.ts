// src/routes/count.ts
import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';

// models/index 에서 필요한 모델/Sequelize 가져오기
const { StatCompany, ServiceStat, Sequelize } = require('../../models');
const { Op, fn, col } = Sequelize;

const router = Router();

// ================= 공통 유틸 =================

// ✔ 엑셀 파일 경로 (서버에서 실제 위치에 맞게 수정하세요)
const EXCEL_FILE_PATH = path.join(
  __dirname,
  '../../uploads/조합원 명부251112.xlsx'
);

// 문자열 안전 변환
function s(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

// 랜덤 정수
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ================= 1) 엑셀 → StatCompany =================

/**
 * GET /count/import-companies
 * 브라우저에서 접속하면 엑셀을 읽어 stat_company 테이블에 upsert 합니다.
 */
router.get('/import-companies', async (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(EXCEL_FILE_PATH)) {
      return res.status(404).json({
        ok: false,
        message: `엑셀 파일을 찾을 수 없습니다: ${EXCEL_FILE_PATH}`,
      });
    }

    const workbook = XLSX.readFile(EXCEL_FILE_PATH);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // header:1 로 2차원 배열로 읽기
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (!rows || rows.length === 0) {
      return res.status(400).json({
        ok: false,
        message: '엑셀에 데이터가 없습니다.',
      });
    }

    // 헤더 행 찾기
    const headerRowIndex = rows.findIndex((row) => {
      if (!row) return false;
      const line = row.map((c: any) => s(c));
      return (
        line.includes('성명') &&
        line.includes('기업명') &&
        line.includes('지역')
      );
    });

    if (headerRowIndex < 0) {
      return res.status(400).json({
        ok: false,
        message: '엑셀에서 [성명, 기업명, 지역] 헤더를 찾을 수 없습니다.',
      });
    }

    const headerRow = rows[headerRowIndex].map(s);

    const idxSeq      = headerRow.indexOf('연번');
    const idxName     = headerRow.indexOf('성명');
    const idxCompany  = headerRow.indexOf('기업명');
    const idxRegion   = headerRow.indexOf('지역');
    const idxPosition = headerRow.indexOf('직책');
    const idxNew      = headerRow.indexOf('신규여부');
    const idxMemo     = headerRow.indexOf('비고');

    if (idxCompany === -1) {
      return res.status(400).json({
        ok: false,
        message: '엑셀에 [기업명] 컬럼이 없습니다.',
      });
    }

    const records: any[] = [];

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const seq        = idxSeq      >= 0 ? s(row[idxSeq])      : String(i - headerRowIndex);
      const memberName = idxName     >= 0 ? s(row[idxName])     : '';
      const companyName=               s(row[idxCompany]);
      const regionRaw  = idxRegion   >= 0 ? s(row[idxRegion])   : '';
      const position   = idxPosition >= 0 ? s(row[idxPosition]) : '';
      const isNew      = idxNew      >= 0 ? s(row[idxNew])      : '';
      const memoRaw    = idxMemo     >= 0 ? s(row[idxMemo])     : '';

      if (!companyName) continue; // 기업명 없으면 스킵

      // region_level1 / level2 분리
      let region_level1: string | null = null;
      let region_level2: string | null = null;
      if (regionRaw) {
        const parts = regionRaw.split(/\s+/).filter(Boolean);
        if (parts.length === 1) {
          region_level1 = parts[0];
        } else {
          region_level1 = parts[0];
          region_level2 = parts.slice(1).join(' ');
        }
      }

      // memo 조합
      const memoParts: string[] = [];
      if (position) memoParts.push(`직책:${position}`);
      if (isNew) memoParts.push(`신규여부:${isNew}`);
      if (memoRaw) memoParts.push(memoRaw);
      const memo = memoParts.join(' / ') || null;

      const code =
        seq && seq !== 'NaN'
          ? `C${String(seq).padStart(3, '0')}`
          : `C${String(i - headerRowIndex).padStart(3, '0')}`;

      records.push({
        code,
        name: companyName,
        ceo: memberName || null,
        region_level1,
        region_level2,
        sort_order: Number(seq) || i - headerRowIndex,
        is_active: true,
        memo,
      });
    }

    if (records.length === 0) {
      return res.status(400).json({
        ok: false,
        message: '엑셀에서 유효한 기업 데이터를 찾지 못했습니다.',
      });
    }

    await StatCompany.bulkCreate(records, {
      ignoreDuplicates: false,
      updateOnDuplicate: [
        'name',
        'ceo',
        'region_level1',
        'region_level2',
        'sort_order',
        'is_active',
        'memo',
        'updatedAt',
      ],
    });

    return res.json({
      ok: true,
      message: '엑셀 데이터를 StatCompany 테이블에 저장했습니다.',
      total: records.length,
      file: EXCEL_FILE_PATH,
    });
  } catch (err: any) {
    console.error('[count/import-companies] error:', err);
    return res.status(500).json({
      ok: false,
      message: '서버 오류',
      error: String(err?.message || err),
    });
  }
});

// ================= 2) 더미 통계 생성 (StatCompany → ServiceStat) =================

/**
 * GET /count/seed-stats?period=2025-01
 * StatCompany 목록을 기준으로 ServiceStat 에 임의 통계(지표 20개씩)를 생성/업데이트
 */

const METRICS = [
  { code: 'REQ_TOTAL',         label: '총 서비스 접수 건수',      type: 'COUNT',  unit: '건' },
  { code: 'REQ_AIRCON',        label: '에어컨 세척 접수 건수',      type: 'COUNT',  unit: '건' },
  { code: 'REQ_MOVEIN',        label: '입주 청소 접수 건수',        type: 'COUNT',  unit: '건' },
  { code: 'REQ_DISINFECT',     label: '소독·방역 접수 건수',        type: 'COUNT',  unit: '건' },

  { code: 'DONE_TOTAL',        label: '총 완료 건수',              type: 'COUNT',  unit: '건' },
  { code: 'DONE_AIRCON',       label: '에어컨 세척 완료 건수',      type: 'COUNT',  unit: '건' },
  { code: 'DONE_MOVEIN',       label: '입주 청소 완료 건수',        type: 'COUNT',  unit: '건' },
  { code: 'DONE_DISINFECT',    label: '소독·방역 완료 건수',        type: 'COUNT',  unit: '건' },

  { code: 'CANCEL_TOTAL',      label: '총 취소/변경 건수',          type: 'COUNT',  unit: '건' },
  { code: 'SENIOR_CENTER_CNT', label: '관리 경로당 수',             type: 'COUNT',  unit: '개' },

  { code: 'AVG_SATISFACTION',  label: '평균 만족도 점수',           type: 'RATIO',  unit: '점' },
  { code: 'REVISIT_RATE',      label: '재이용(재계약) 비율',        type: 'RATIO',  unit: '%' },

  { code: 'UNIT_AIRCON',       label: '에어컨 세척 대수',           type: 'COUNT',  unit: '대' },
  { code: 'UNIT_MOVEIN',       label: '입주 청소 세대 수',          type: 'COUNT',  unit: '세대' },

  { code: 'REV_AIRCON',        label: '에어컨 세척 매출',           type: 'AMOUNT', unit: '원' },
  { code: 'REV_MOVEIN',        label: '입주 청소 매출',             type: 'AMOUNT', unit: '원' },
  { code: 'REV_DISINFECT',     label: '소독·방역 매출',             type: 'AMOUNT', unit: '원' },
  { code: 'REV_TOTAL',         label: '총 매출 합계',               type: 'AMOUNT', unit: '원' },

  { code: 'WORKING_HOURS',     label: '총 작업 시간',               type: 'COUNT',  unit: '시간' },
];

router.get('/seed-stats', async (req: Request, res: Response) => {
  try {
    const periodKey = (req.query.period as string) || '2025-01';

    const companies = await StatCompany.findAll({
      where: { is_active: true },
      order: [['sort_order', 'ASC'], ['id', 'ASC']],
      raw: true,
    });

    if (!companies || companies.length === 0) {
      return res.status(400).json({
        ok: false,
        message: '활성화된 StatCompany 데이터가 없습니다. 먼저 /count/import-companies 를 실행하세요.',
      });
    }

    const records: any[] = [];

    for (const comp of companies) {
      const region1 = comp.region_level1 || '전국';
      const region2 = comp.region_level2 || null;
      const regionKey = region2 ? `${region1}>${region2}` : region1;

      METRICS.forEach((m) => {
        let value: number;

        if (m.type === 'AMOUNT') {
          value = randInt(10, 2000) * 10000;           // 10만 ~ 2,000만
        } else if (m.type === 'RATIO') {
          if (m.code === 'AVG_SATISFACTION') {
            value = randInt(30, 50) / 10;              // 3.0 ~ 5.0 점
          } else {
            value = randInt(50, 100);                  // 50 ~ 100 %
          }
        } else {
          value = randInt(0, 500);                     // 0 ~ 500 건/개
        }

        records.push({
          company_id: comp.id,
          period_key: periodKey,
          region_key: regionKey,
          metric_code: m.code,
          metric_label: m.label,
          metric_type: m.type,
          value,
          unit: m.unit,
          note: `seeded for ${comp.code || comp.name}`,
        });
      });
    }

    await ServiceStat.bulkCreate(records, {
      updateOnDuplicate: [
        'metric_label',
        'metric_type',
        'value',
        'unit',
        'note',
        'region_key',
        'period_key',
        'updatedAt',
      ],
    });

    return res.json({
      ok: true,
      message: '임의 통계 데이터를 ServiceStat 테이블에 저장했습니다.',
      period_key: periodKey,
      company_count: companies.length,
      stat_count: records.length,
    });
  } catch (err: any) {
    console.error('[count/seed-stats] error:', err);
    return res.status(500).json({
      ok: false,
      message: '서버 오류',
      error: String(err?.message || err),
    });
  }
});

// ================= 3) 지역별 · 기간별 통계 조회 =================

/**
 * GET /count/region-daily
 * 예)
 *   /count/region-daily
 *   /count/region-daily?metric=REV_TOTAL
 *   /count/region-daily?metric=REQ_TOTAL&period_from=2025-01&period_to=2025-12
 *   /count/region-daily?metric=REQ_TOTAL&region=부산
 */
router.get('/region-daily', async (req: Request, res: Response) => {
  try {
    const metric = (req.query.metric as string) || 'REQ_TOTAL';

    const periodFrom = req.query.period_from as string | undefined;
    const periodTo   = req.query.period_to as string | undefined;

    const region1    = req.query.region as string | undefined;

    const where: any = { metric_code: metric };

    if (periodFrom && periodTo) {
      where.period_key = { [Op.between]: [periodFrom, periodTo] };
    } else if (periodFrom) {
      where.period_key = { [Op.gte]: periodFrom };
    } else if (periodTo) {
      where.period_key = { [Op.lte]: periodTo };
    }

    if (region1) {
      where.region_key = { [Op.like]: `${region1}%` };
    }

    const rows = await ServiceStat.findAll({
      attributes: [
        'region_key',
        'period_key',
        'metric_code',
        'metric_label',
        [fn('SUM', col('value')), 'total_value'],
      ],
      where,
      group: ['region_key', 'period_key', 'metric_code', 'metric_label'],
      order: [
        ['region_key', 'ASC'],
        ['period_key', 'ASC'],
      ],
      raw: true,   // 🔥 프론트에서 다루기 편하게
    });

    return res.json({
      ok: true,
      metric,
      count: rows.length,
      rows,
    });
  } catch (err: any) {
    console.error('[count/region-daily] error:', err);
    return res.status(500).json({
      ok: false,
      message: '서버 오류',
      error: String(err?.message || err),
    });
  }
});
// ================= 4) 지역별 전체 서비스 건수 요약 =================

/**
 * GET /count/region-summary
 * - metric: 기본 'REQ_TOTAL'
 * - 모든 기간 합산해서 시도(서울/부산/경기/...) 단위로 묶음
 */
router.get('/region-summary', async (req: Request, res: Response) => {
  try {
    const metric = (req.query.metric as string) || 'REQ_TOTAL';

    const where: any = { metric_code: metric };

    // 필요하면 기간 필터도 추가할 수 있음 (지금은 전체 기간)
    // const periodFrom = req.query.period_from as string | undefined;
    // const periodTo = req.query.period_to as string | undefined;
    // ...

    const statRows = await ServiceStat.findAll({
      attributes: [
        'region_key',
        [fn('SUM', col('value')), 'total_value'],
      ],
      where,
      group: ['region_key'],
      raw: true,
    });

    // region_key: "부산>해운대구" → "부산" 으로 묶기
    const regionMap = new Map<string, number>();
    for (const row of statRows as any[]) {
      const regionKey = String(row.region_key || '');
      const topRegion = regionKey.split('>')[0].trim() || '기타';
      const val = Number(row.total_value ?? 0);
      const prev = regionMap.get(topRegion) ?? 0;
      regionMap.set(topRegion, prev + val);
    }

    const regions = Array.from(regionMap.entries()).map(([region, total]) => ({
      region,
      total,
    }));

    // 내림차순 정렬
    regions.sort((a, b) => b.total - a.total);

    return res.json({
      ok: true,
      metric,
      count: regions.length,
      rows: regions, // [{ region: '부산', total: 1234 }, ...]
    });
  } catch (err: any) {
    console.error('[count/region-summary] error:', err);
    return res.status(500).json({
      ok: false,
      message: '서버 오류',
      error: String(err?.message || err),
    });
  }
});
// ================= 5) 특정 지역의 업체별 서비스 건수 목록 =================

/**
 * GET /count/company-by-region?region=부산
 * - metric: 기본 'REQ_TOTAL'
 * - region: 시도 기준 (예: '부산')
 * - 결과: [{ company_id, company_name, total }, ...]
 */
router.get('/company-by-region', async (req: Request, res: Response) => {
  try {
    const metric = (req.query.metric as string) || 'REQ_TOTAL';
    const region1 = (req.query.region as string) || '';

    if (!region1) {
      return res.status(400).json({
        ok: false,
        message: 'region 파라미터가 필요합니다. 예: ?region=부산',
      });
    }

    const where: any = { metric_code: metric };
    // "부산>해운대구", "부산>동구" 등 모두 포함
    where.region_key = { [Op.like]: `${region1}%` };

    const statRows = await ServiceStat.findAll({
      attributes: [
        'company_id',
        [fn('SUM', col('value')), 'total_value'],
      ],
      where,
      group: ['company_id'],
      raw: true,
    });

    const companyIds = (statRows as any[])
      .map(r => r.company_id)
      .filter((id) => id != null);

    let companyMap = new Map<number, string>();
    if (companyIds.length > 0) {
      const companies = await StatCompany.findAll({
        where: { id: { [Op.in]: companyIds } },
        attributes: ['id', 'name'],
        raw: true,
      });

      companyMap = new Map<number, string>();
      for (const c of companies as any[]) {
        companyMap.set(Number(c.id), String(c.name));
      }
    }

    const rows = (statRows as any[]).map(r => {
      const cid = Number(r.company_id ?? 0);
      return {
        company_id: cid,
        company_name: companyMap.get(cid) || `회사#${cid}`,
        total: Number(r.total_value ?? 0),
      };
    });

    // 업체별 건수 내림차순
    rows.sort((a, b) => b.total - a.total);

    return res.json({
      ok: true,
      metric,
      region: region1,
      count: rows.length,
      rows,
    });
  } catch (err: any) {
    console.error('[count/company-by-region] error:', err);
    return res.status(500).json({
      ok: false,
      message: '서버 오류',
      error: String(err?.message || err),
    });
  }
});

// ================= export =================
export default  router;
