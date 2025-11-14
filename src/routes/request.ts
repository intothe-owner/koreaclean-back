import { Router, Request, Response } from "express";
import dotenv from "dotenv";
import * as jwt from 'jsonwebtoken';
import { Op, WhereOptions, UniqueConstraintError } from "sequelize";
import { sendEmail } from "../lib/mailer";
// ==============================
// 견적 저장 & 미리보기(PDF)
// ==============================
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
type PDFDoc = InstanceType<typeof PDFDocument>; // ✅ 핵심!
// ---- 한글 폰트 경로 (원하는 폰트로 교체 가능) ----
const FONT_DIR = path.join(__dirname, "../../assets/fonts");
const KR_REG = path.join(FONT_DIR, "NotoSansKR-Regular.ttf");
const KR_BOLD = path.join(FONT_DIR, "NotoSansKR-Bold.ttf");
type SeniorWorkPayload = {
  id?: number;
  name?: string;
  address?: string;
  address_detail?: string;
  lat?: number | null;
  lng?: number | null;
  work_date?: string | null;
  work?: string | null;
  status?: string | null; // WAIT | IN_PROGRESS | DONE ...
};
// 서버 시작 시 1회 등록(없는 경우 에러 방지용 가드)
function registerKoreanFonts(doc: PDFDoc) {
  // pdfkit은 doc 인스턴스마다 registerFont가 필요합니다.
  if (fs.existsSync(KR_REG)) doc.registerFont("kr-regular", KR_REG);
  if (fs.existsSync(KR_BOLD)) doc.registerFont("kr-bold", KR_BOLD);
}

// 안전하게 폰트 선택 (없으면 기본 폰트로 fallback)
function useKR(doc: PDFDoc, bold = false) {
  const name = bold ? "kr-bold" : "kr-regular";
  try {
    doc.font(name);
  } catch {
    // 폰트가 없으면 기본 폰트(영문) 유지
  }
}

const { ServiceRequest, User, Assignment, sequelize, Company, ChatRoom, ChatMember, ChatMessage } = require("../../models");
dotenv.config();
type Secret = jwt.Secret;
const router = Router();

const ACCESS_SECRET: Secret = (process.env.JWT_ACCESS_SECRET ?? 'dev-access') as Secret;

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch { return []; }
  }
  return [];
}
const SERVICE_ALLOWED = ['토탈케어서비스', '대행청소', '소독방역', '에어컨종합세척', '기타'];
// seniors 정규화: 배열/JSON 문자열 모두 대응
type SeniorInput = { id?: number; name?: string; address?: string; lat?: number | null; lng?: number | null } | null | undefined;
function normalizeSeniors(input: any): SeniorInput[] {
  try {
    // 문자열이면 JSON 파싱
    if (typeof input === 'string') {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed : [];
    }
    // 배열이면 그대로
    if (Array.isArray(input)) return input;
    return [];
  } catch {
    return [];
  }
}
//서비스신청 저장하기
router.post("/save", async (req: Request, res: Response) => {
  try {
    const {
      org_name,
      contact_name,
      contact_tel,
      contact_phone,
      contact_email,
      seniors: seniorsRaw,     // ← 바디에서 받은 원본
      hope_date,
      etc,
      files,
    } = req.body;

    const serviceTypes = toArray(req.body.service_types)
      .filter((s) => SERVICE_ALLOWED.includes(s));

    // --- 인증 ---
    const bearer = req.headers.authorization;
    const fromHeader = bearer?.startsWith('Bearer ') ? bearer.split(' ')[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);
    if (!token) return res.status(401).json({ is_success: false, message: '인증 토큰이 필요합니다.' });

    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    const user = await User.findByPk(decoded.sub);
    if (!user) return res.status(401).json({ is_success: false, message: '유효하지 않은 토큰입니다.' });
    const client_id = user.get('id');

    // --- seniors 정규화 & 경로당명만 추출 ---
    const seniors = normalizeSeniors(seniorsRaw);
    const seniorNames = seniors
      .map(s => (s?.name || '').trim())
      .filter(Boolean)
      .join(', '); // "송정경로당, OO경로당" 형태

    // --- DB 저장 (모델이 JSON 컬럼이면 그대로 저장 가능) ---
    await ServiceRequest.create({
      org_name,
      contact_name,
      contact_tel,
      contact_phone,
      contact_email,
      seniors,                // 원본 배열 그대로 저장
      service_type: serviceTypes,
      hope_date,
      etc,
      files,
      client_id
    });

    // --- 이메일 본문: 경로당명만 ---
    const html = `
      <h3>${org_name} 서비스 신청</h3>
      <p><b>기관명:</b> ${org_name}</p>
      <p><b>담당자:</b> ${contact_name}</p>
      <p><b>연락처:</b> tel.${contact_tel || ''} / mobile.${contact_phone || ''}</p>
      <p><b>이메일:</b> ${contact_email}</p>
      <p><b>경로당:</b> ${seniorNames || '-'}</p>
      <p><b>서비스형태:</b> ${serviceTypes.join(', ') || '-'}</p>
      <p><b>희망일:</b> ${hope_date || '-'}</p>
      ${etc ? `<hr/><pre style="white-space:pre-wrap">${etc}</pre>` : ''}
    `;

    await sendEmail({
      to: 'kimnamhyong@gmail.com',
      subject: '서비스신청',
      html
    });

    return res.json({ is_success: true, msg: '저장 성공' });
  } catch (error: any) {
    console.log(error);
    return res.status(401).json({ is_success: false, msg: '저장 실패' });
  }
});


// 목록 조회
// ===== 목록 조회 =====
router.get("/list", async (req: Request, res: Response) => {
  try {
    // ---- 인증 ----
    const bearer = req.headers.authorization;
    const fromHeader = bearer?.startsWith("Bearer ") ? bearer.split(" ")[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);
    if (!token) {
      return res.status(401).json({ is_success: false, message: "인증 토큰이 필요합니다." });
    }
    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    const user = await User.findByPk(decoded.sub);
    if (!user) {
      return res.status(401).json({ is_success: false, message: "유효하지 않은 토큰입니다." });
    }
    const user_id = Number(user.id);

    // ---- Query Params ----
    const {
      q = "",
      org_name = "",
      contact_name = "",
      status,
      page = "1",
      page_size = "10",
      order_by = "createdAt",
      order_dir = "DESC",
      mine,
    } = req.query as Record<string, string>;

    const pageNum = Math.max(parseInt(page || "1", 10) || 1, 1);
    const pageSizeNum = Math.min(Math.max(parseInt(page_size || "10", 10) || 10, 1), 100);

    type SRStatus = "WAIT" | "IN_PROGRESS" | "DONE" | "CANCELLED";
    const KOR_TO_DB: Record<string, SRStatus | undefined> = {
      "대기": "WAIT", "진행중": "IN_PROGRESS", "완료": "DONE", "취소": "CANCELLED",
    };
    const ENG_TO_DB: Record<string, SRStatus | undefined> = {
      WAIT: "WAIT", IN_PROGRESS: "IN_PROGRESS", DONE: "DONE", CANCELLED: "CANCELLED", CANCELED: "CANCELLED",
    };
    const UI_TO_DB: Record<string, SRStatus | undefined> = {
      pending: "WAIT", wait: "WAIT", waiting: "WAIT",
      progress: "IN_PROGRESS", in_progress: "IN_PROGRESS", working: "IN_PROGRESS",
      done: "DONE", complete: "DONE", completed: "DONE",
      canceled: "CANCELLED", cancelled: "CANCELLED",
    };

    let mappedStatus: SRStatus | undefined;
    if (status) {
      const key = String(status).trim();
      mappedStatus = KOR_TO_DB[key] || ENG_TO_DB[key.toUpperCase()] || UI_TO_DB[key.toLowerCase()];
    }

    const mineIsClient = String(mine || "").toLowerCase() === "client";
    const mineIsCompany = String(mine || "").toLowerCase() === "company";

    // ---- where ----
    const ands: WhereOptions[] = [];
    if (org_name.trim()) ands.push({ org_name: { [Op.like]: `%${org_name.trim()}%` } });
    if (contact_name.trim()) ands.push({ contact_name: { [Op.like]: `%${contact_name.trim()}%` } });
    if (q && q.trim()) {
      const like = `%${q.trim()}%`;
      ands.push({
        [Op.or]: [
          { org_name: { [Op.like]: like } },
          { contact_name: { [Op.like]: like } },
          { contact_tel: { [Op.like]: like } },
          { contact_phone: { [Op.like]: like } },
          { contact_email: { [Op.like]: like } },
        ],
      });
    }
    if (mappedStatus) ands.push({ status: mappedStatus });
    if (mineIsClient) ands.push({ client_id: user_id });

    const where: WhereOptions = ands.length ? { [Op.and]: ands } : {};

    // ---- 정렬 ----
    const ORDERABLE = new Set(["createdAt", "updatedAt", "org_name", "status", "hope_date"]);
    const orderField = ORDERABLE.has(order_by) ? order_by : "createdAt";
    const orderDir = (order_dir?.toUpperCase() === "ASC") ? "ASC" : "DESC";

    // ---- include (배정 최신 1건) ----
    const assignmentInclude: any = {
      model: Assignment,
      as: "assignment",
      required: mineIsCompany ? true : false,
      separate: mineIsCompany ? false : true,
      paranoid: true,
      ...(mineIsCompany ? {} : { limit: 1 }),
      order: [["createdAt", "DESC"]],
      where: { status: { [Op.in]: ["PENDING", "ACCEPTED", "IN_PROGRESS"] } },
      include: [
        {
          model: Company,
          as: "company",
          attributes: ["id", "name", "ceo", "regions", "tel", "status"],
          ...(mineIsCompany ? { where: { owner_user_id: user_id } } : {}),
        },
      ],
    };

    // ---- 조회 ----
    const { rows, count } = await ServiceRequest.findAndCountAll({
      where,
      order: [[orderField, orderDir]],
      limit: pageSizeNum,
      offset: (pageNum - 1) * pageSizeNum,
      include: [assignmentInclude],
      distinct: true,
      subQuery: false,
      // attributes는 지정하지 않음 → 모든 컬럼(estimate_* 포함) 반환
    });

    // ✅ 1) 이번 페이지의 SR → ChatRoom 매핑
    const srIds: number[] = rows.map((r: any) => r.id);
    const roomBySrId = new Map<number, { id: number; service_request_id: number }>();
    if (srIds.length > 0) {
      const rooms = await ChatRoom.findAll({
        where: { service_request_id: { [Op.in]: srIds } },
        attributes: ["id", "service_request_id"],
        raw: true,
      });
      for (const r of rooms) {
        roomBySrId.set(Number(r.service_request_id), { id: Number(r.id), service_request_id: Number(r.service_request_id) });
      }
    }

    // ✅ 2) 내 멤버십(ChatMember) 가져오기 → unread_count/last_read_at
    const roomIds = Array.from(roomBySrId.values()).map((r) => r.id);
    type MemberRow = { room_id: number; unread_count: number | null; last_read_at: Date | null };
    const memberByRoom = new Map<number, MemberRow>();
    if (roomIds.length > 0) {
      const members: MemberRow[] = await ChatMember.findAll({
        where: { room_id: { [Op.in]: roomIds }, user_id },
        attributes: ["room_id", "unread_count", "last_read_at"],
        raw: true,
      });
      for (const m of members) memberByRoom.set(Number(m.room_id), m);
    }

    // ✅ 3) unread_count 산출
    const unreadCountByRoom = new Map<number, number>();
    const needFallback: Array<{ room_id: number; last_read_at: Date | null }> = [];

    for (const roomId of roomIds) {
      const mem = memberByRoom.get(roomId);
      if (mem && typeof mem.unread_count === "number") {
        unreadCountByRoom.set(roomId, Math.max(0, Number(mem.unread_count)));
      } else {
        needFallback.push({ room_id: roomId, last_read_at: mem?.last_read_at ?? null });
      }
    }

    // fallback 계산
    if (needFallback.length > 0) {
      await Promise.all(
        needFallback.map(async ({ room_id, last_read_at }) => {
          const whereMsg: any = {
            room_id,
            sender_user_id: { [Op.ne]: user_id },
          };
          if (last_read_at) whereMsg.sent_at = { [Op.gt]: last_read_at };
          const cnt = await ChatMessage.count({ where: whereMsg });
          unreadCountByRoom.set(room_id, cnt);
        })
      );
    }

    // ---- estimate 정규화 helper ----
    // ---- estimate 정규화 helper ----
    function normalizeEstimate(row: any) {
      // 0) row.get('estimate') 지원 (Sequelize)
      const pick = (k: string) => {
        try {
          if (row?.get && typeof row.get === "function") {
            const v = row.get(k);
            return v !== undefined ? v : row?.[k];
          }
          return row?.[k];
        } catch { return row?.[k]; }
      };

      // 1) 단일 JSON 컬럼 우선: estimate -> estimate_json -> 문자열 파싱
      let src: any = pick("estimate") ?? pick("estimate_json");
      if (typeof src === "string") {
        try { src = JSON.parse(src); } catch { /* ignore */ }
      }

      // 1-1) 단일 JSON이 정상이라면 숫자/기본값 보정 후 반환
      if (src && typeof src === "object") {
        const asNum = (v: any) =>
          typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;

        const items = Array.isArray(src.items)
          ? src.items.map((it: any) => ({
            name: String(it?.name ?? ""),
            detail: it?.detail ? String(it.detail) : "",
            qty: it?.qty != null ? Number(it.qty) : null,
            unit: it?.unit ? String(it.unit) : "",
            unit_price: it?.unit_price != null ? asNum(it.unit_price) : null,
            amount: asNum(it?.amount),
            note: it?.note ? String(it.note) : "",
          }))
          : [];

        return {
          title: src.title ?? "견적서",
          issue_date: src.issue_date ?? null,
          valid_until: src.valid_until ?? null,
          supplier: src.supplier ?? {},
          client: src.client ?? {},
          items,
          subtotal: asNum(src.subtotal),
          vat_rate: Number(src.vat_rate) === 0.1 ? 0.1 : 0,
          vat: asNum(src.vat),
          total: asNum(src.total),
          vat_included: Boolean(src.vat_included),
          memo: src.memo ?? undefined,
        };
      }

      // 2) 레거시 개별 칼럼 조합 (없으면 빈 구조)
      const parseMaybeJson = (v: any) => {
        if (!v) return undefined;
        if (typeof v === "string") {
          try { return JSON.parse(v); } catch { return undefined; }
        }
        return v;
      };

      const supplier = parseMaybeJson(pick("estimate_supplier")) ?? {};
      const client = parseMaybeJson(pick("estimate_client")) ?? {};
      const items = parseMaybeJson(pick("estimate_items")) ?? [];

      const asNum = (v: any) =>
        typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;

      return {
        title: pick("estimate_title") ?? "견적서",
        issue_date: pick("estimate_issue_date") ?? null,
        valid_until: pick("estimate_valid_until") ?? null,
        supplier,
        client,
        items,
        subtotal: asNum(pick("estimate_subtotal") ?? 0),
        vat_rate: Number(pick("estimate_vat_rate") ?? 0) === 0.1 ? 0.1 : 0,
        vat: asNum(pick("estimate_vat") ?? 0),
        total: asNum(pick("estimate_total") ?? 0),
        vat_included: Boolean(pick("estimate_vat_included") ?? false),
        memo: pick("estimate_memo") ?? undefined,
      };
    }
    console.log(rows);

    // ---- 결과 정규화 + unread_count/estimate 주입 ----
    // ---- 결과 정규화 + unread_count/estimate 주입 ----
    const items = rows.map((r: any) => {
      const j = r.toJSON();

      // latest_assignment 통일
      const a = j.assignment;
      let latest: any = null;
      if (Array.isArray(a)) latest = a.length ? a[0] : null;
      else if (a && typeof a === "object") latest = a;
      j.latest_assignment = latest;
      delete j.assignment;

      // 🔔 unread_count & chat_room_id
      const room = roomBySrId.get(j.id);
      const unread = room ? (unreadCountByRoom.get(room.id) ?? 0) : 0;
      j.unread_count = unread;
      j.chat_room_id = room?.id ?? null;

      // 🧾 estimate 추가 (원본 row 기준으로 추출!)
      const est = normalizeEstimate(r);
      if (est) j.estimate = est;

      return j;
    });
    


    return res.json({
      is_success: true,
      items,
      page: pageNum,
      page_size: pageSizeNum,
      total: count,
      total_pages: Math.max(1, Math.ceil(count / pageSizeNum)),
      order_by: orderField,
      order_dir: orderDir,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ is_success: false, message: "목록 조회 실패" });
  }
});



router.post("/:id/assign", async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    // 1) 인증
    const bearer = req.headers.authorization;
    const fromHeader = bearer?.startsWith("Bearer ") ? bearer.split(" ")[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);
    if (!token) {
      await t.rollback();
      return res.status(401).json({ is_success: false, message: "인증 토큰이 필요합니다." });
    }
    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    const user = await User.findByPk(decoded.sub);
    if (!user) {
      await t.rollback();
      return res.status(401).json({ is_success: false, message: "유효하지 않은 토큰입니다." });
    }

    // 2) 파라미터/바디
    const serviceRequestId = Number(req.params.id);
    const { company_id, notes } = req.body as { company_id?: number; notes?: string };
    if (!serviceRequestId || !company_id) {
      await t.rollback();
      return res.status(400).json({ is_success: false, message: "service_request_id와 company_id가 필요합니다." });
    }

    // 3) 유효성 체크: 신청/업체 존재
    const sr = await ServiceRequest.findByPk(serviceRequestId, { transaction: t });
    if (!sr) {
      await t.rollback();
      return res.status(404).json({ is_success: false, message: "신청을 찾을 수 없습니다." });
    }
    const company = await Company.findByPk(company_id, { transaction: t });
    if (!company) {
      await t.rollback();
      return res.status(404).json({ is_success: false, message: "업체를 찾을 수 없습니다." });
    }

    // 4) 이전 배정 조회(미삭제 행만)
    const prev = await Assignment.findOne({
      where: { service_request_id: serviceRequestId },
      order: [["createdAt", "DESC"]],
      paranoid: true, // 기본값: 삭제 안된 행만
      transaction: t,
    });

    if (prev) {
      // 이전 배정이 현재 살아있으면 → 배정 취소로 변경 
      await prev.update(
        {
          status: "CANCELLED",
          cancel_memo: "다른 업체 배정",
        },
        { transaction: t }
      );
    }

    // 5) 새 배정 생성
    const newAssign = await Assignment.create(
      {
        service_request_id: serviceRequestId,
        company_id,
        notes: notes ?? null,
        status: "PENDING", // 기본값(필요 시 "IN_PROGRESS" 등 정책에 맞게)
      },
      { transaction: t }
    );

    // 6) 서비스 신청 상태 갱신 (정책에 맞게)
    // 요구사항에서 배정 시 진행중으로 보낸다고 했으니:
    //await sr.update({ status: "IN_PROGRESS" }, { transaction: t });

    await t.commit();
    return res.json({ is_success: true, item: newAssign });
  } catch (err: any) {
    // 👉 만약 유니크 제약(단일 컬럼 unique) 때문에 막히는 환경이라면,
    // 아래와 같이 fallback 처리 가능 (권장X, 임시 방편)
    if (err instanceof UniqueConstraintError) {
      try {
        // 강제 삭제(하드) 후 재시도 (히스토리 소실 위험)
        const serviceRequestId = Number(req.params.id);
        const { company_id, notes } = req.body as { company_id?: number; notes?: string };

        const prev = await Assignment.findOne({
          where: { service_request_id: serviceRequestId },
          paranoid: false, // 삭제된 것도 포함
        });
        if (prev) {
          // 상태만 남기고 진짜 삭제
          if (prev.get("status") !== "CANCELLED") {
            await prev.update(
              { status: "CANCELLED", cancel_memo: "다른 업체 배정" },
              { paranoid: false }
            );
          }
          await prev.destroy({ force: true }); // 하드 삭제
        }

        const newAssign = await Assignment.create({
          service_request_id: serviceRequestId,
          company_id,
          notes: notes ?? null,
          status: "PENDING",
        });

        // 서비스 신청 상태 갱신
        await ServiceRequest.update(
          { status: "IN_PROGRESS" },
          { where: { id: serviceRequestId } }
        );

        return res.json({ is_success: true, item: newAssign, warn: "기존 배정 강제 삭제(UNIQUE 회피) 처리됨. 복합 유니크로 전환 권장." });
      } catch (e2) {
        console.error(e2);
      }
    }

    console.error(err);
    try { await t.rollback(); } catch { }
    return res.status(500).json({ is_success: false, message: "배정 실패" });
  }
});

router.post("/:id/status", async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    // ---- 인증 ----
    const bearer = req.headers.authorization;
    const fromHeader = bearer?.startsWith("Bearer ") ? bearer.split(" ")[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);
    if (!token) {
      return res.status(401).json({ is_success: false, message: "인증 토큰이 필요합니다." });
    }
    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    const user = await User.findByPk(decoded.sub);
    if (!user) {
      return res.status(401).json({ is_success: false, message: "유효하지 않은 토큰입니다." });
    }
    const user_id = user.id;

    const { id } = req.params;
    if(status==='WAIT'||status==='CANCELLED'){
      await Assignment.update({
        status:'CANCELLED'
      },{
        where:{
          service_request_id:id
        }
      })
      await ServiceRequest.update({
        estimate:null
      }, {
        where: {
          id
        }
      });
    }
    
    await ServiceRequest.update({
      status
    }, {
      where: {
        id
      }
    });


    return res.json({ is_success: true, message: "상태가 변경되었습니다." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ is_success: false, message: "배정 상태 변경 실패" });
  }
});
router.patch("/assignment/:id/status", async (req: Request, res: Response) => {
  try {
    // ---- 인증 ----
    const bearer = req.headers.authorization;
    const fromHeader = bearer?.startsWith("Bearer ") ? bearer.split(" ")[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);
    if (!token) {
      return res.status(401).json({ is_success: false, message: "인증 토큰이 필요합니다." });
    }
    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    const user = await User.findByPk(decoded.sub);
    if (!user) {
      return res.status(401).json({ is_success: false, message: "유효하지 않은 토큰입니다." });
    }
    const user_id = user.id;

    const { id } = req.params;

    const { status, cancel_memo } = req.body as { status?: string; cancel_memo?: string };

    const next = String(status || "").toUpperCase();
    const ALLOWED: Record<string, true> = { ACCEPTED: true, DECLINED: true };
    if (!ALLOWED[next]) {
      return res.status(400).json({ is_success: false, message: "허용되지 않은 배정 상태" });
    }
    if (next === "DECLINED" && !String(cancel_memo || "").trim()) {
      return res.status(400).json({ is_success: false, message: "거절 사유(cancel_memo)는 필수입니다." });
    }

    // 배정 + 회사 로드 (소유자 확인)
    const assignment = await Assignment.findByPk(id, {
      include: [{ model: Company, as: "company", attributes: ["id", "owner_user_id"], paranoid: true }],
      paranoid: true,
    });
    if (!assignment) return res.status(404).json({ is_success: false, message: "배정을 찾을 수 없습니다." });

    const a: any = assignment.toJSON();
    await ServiceRequest.update({
      status: status === 'ACCEPTED' ? 'IN_PROGRESS' : 'WAIT',
    }, {
      where: {
        id: a.service_request_id
      }
    });
    if (!a.company || a.company.owner_user_id !== user_id) {
      return res.status(403).json({ is_success: false, message: "권한이 없습니다." });
    }

    // 현재 상태 검사 (원하면 조건 조정 가능)
    const curr = String((assignment as any).status || "").toUpperCase();
    if (curr !== "PENDING") {
      return res.status(400).json({ is_success: false, message: "대기 상태에서만 변경할 수 있습니다." });
    }

    // 업데이트
    await assignment.update({
      status: next,               // ACCEPTED | DECLINED
      cancel_memo: next === "DECLINED" ? cancel_memo?.trim() || null : null,
      accepted_at: next === "ACCEPTED" ? new Date() : null, // 필드 없으면 제거
      rejected_at: next === "DECLINED" ? new Date() : null, // 필드 없으면 제거
    });

    return res.json({ is_success: true, item: assignment, message: "배정 상태가 변경되었습니다." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ is_success: false, message: "배정 상태 변경 실패" });
  }
});

//경로당별로 작업 업데이트
//경로당별로 작업 업데이트
router.post("/:requestId/seniors-json", async (req: Request, res: Response) => {
  try {
    // 0) 인증 (ensureAuthed는 아래쪽에 선언돼 있어도 function 이라 호이스팅 됩니다)
    const decoded = ensureAuthed(req, res);
    if (!decoded) return;

    // 1) 파라미터
    const requestId = Number(req.params.requestId);
    if (!requestId) {
      return res
        .status(400)
        .json({ is_success: false, message: "유효하지 않은 requestId 입니다." });
    }

    // 2) 바디에서 seniors 꺼내기
    const { seniors } = req.body as { seniors?: SeniorWorkPayload[] };
    if (!Array.isArray(seniors)) {
      return res
        .status(400)
        .json({ is_success: false, message: "seniors 배열이 필요합니다." });
    }

    // 3) 정규화: DB에 저장할 형태로 가공
    const normalized = seniors.map((s, idx) => {
      const statusRaw = (s.status || "").toString().toUpperCase();

      // 기본값: WAIT / IN_PROGRESS / DONE 정도만 사용 (필요하면 추가)
      const ALLOWED = new Set(["WAIT", "IN_PROGRESS", "DONE"]);
      const status = ALLOWED.has(statusRaw) ? statusRaw : "WAIT";

      return {
        id: s.id ?? idx,
        name: s.name ?? "",
        address: s.address ?? "",
        address_detail: s.address_detail ?? "",
        lat:
          typeof s.lat === "number"
            ? s.lat
            : s.lat != null
            ? Number(s.lat)
            : null,
        lng:
          typeof s.lng === "number"
            ? s.lng
            : s.lng != null
            ? Number(s.lng)
            : null,
        work_date: s.work_date ?? "", // 빈 문자열 허용
        work: s.work ?? "",
        status, // ✅ 경로당별 상태까지 같이 저장
      };
    });

    console.log("seniors-normalized:", normalized);

    // 4) ServiceRequest.seniors JSON 컬럼 업데이트
    const [affected] = await ServiceRequest.update(
      { seniors: normalized },
      { where: { id: requestId } }
    );

    if (!affected) {
      return res
        .status(404)
        .json({ is_success: false, message: "신청을 찾을 수 없습니다." });
    }

    return res
      .status(200)
      .json({
        is_success: true,
        message: "작업 업데이트 성공",
        seniors: normalized,
      });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ is_success: false, message: "작업 업데이트 실패" });
  }
});




// 프론트와 맞춘 타입 (간단 검증용)
type EstimateItem = {
  name: string;
  detail?: string;
  qty?: number | null;
  unit?: string;
  unit_price?: number | null;
  amount: number;
  note?: string;
};
type PartyInfo = {
  name?: string;
  biz_no?: string;
  ceo?: string;
  charge_name?: string;
  contact?: string;
  email?: string;
  address?: string;
};
type EstimatePayload = {
  issue_date: string;
  valid_until?: string;
  title?: string;
  supplier: PartyInfo;
  client: PartyInfo;
  items: EstimateItem[];
  subtotal: number;
  vat_rate: number;      // 0 or 0.1
  vat: number;
  total: number;
  vat_included?: boolean;
  memo?: string;
};

// 합계 재계산(서버 신뢰 계산)
function calcTotals(sum: number, rate: number, included: boolean) {
  const r = Number(rate) === 0.1 ? 0.1 : 0; // 방어
  if (r <= 0) return { subtotal: sum, vat: 0, total: sum };
  if (!included) {
    const vat = Math.floor(sum * r);
    return { subtotal: sum, vat, total: sum + vat };
  }
  const total = sum;
  const subtotal = Math.round(total / (1 + r));
  const vat = total - subtotal;
  return { subtotal, vat, total };
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function ensureAuthed(req: Request, res: Response) {
  const bearer = req.headers.authorization;
  const fromHeader = bearer?.startsWith("Bearer ") ? bearer.split(" ")[1] : undefined;
  const token = fromHeader || (req.cookies?.access_token as string | undefined);
  if (!token) {
    res.status(401).json({ is_success: false, message: "인증 토큰이 필요합니다." });
    return null;
  }
  try {
    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    return decoded;
  } catch {
    res.status(401).json({ is_success: false, message: "유효하지 않은 토큰입니다." });
    return null;
  }
}

/** [POST] /api/request/:id/estimate
 *  견적 JSON을 ServiceRequest.estimate 에 저장
 */
router.post("/:id/estimate", async (req: Request, res: Response) => {
  try {
    const decoded = ensureAuthed(req, res);
    if (!decoded) return;

    const requestId = Number(req.params.id);
    if (!requestId) return res.status(400).json({ is_success: false, message: "유효하지 않은 id" });

    const body = req.body as EstimatePayload;

    // 최소 검증
    if (!body || !Array.isArray(body.items)) {
      return res.status(400).json({ is_success: false, message: "잘못된 견적 데이터" });
    }

    // 서버 합계 재계산 (신뢰)
    const sum = body.items.reduce((acc, it) => acc + n(it.amount), 0);
    const included = !!body.vat_included;
    const rate = Number(body.vat_rate) === 0.1 ? 0.1 : 0;
    const totals = calcTotals(sum, rate, included);

    const estimateToSave: EstimatePayload = {
      ...body,
      subtotal: totals.subtotal,
      vat: totals.vat,
      total: totals.total,
      vat_rate: rate,
      vat_included: included,
      title: body.title || "견적서",
    };


    // 저장 (컬럼명이 다르면 'estimate' 변경)
    const [affected] = await ServiceRequest.update(
      { estimate: estimateToSave },
      { where: { id: requestId } }
    );
    if (!affected) {
      return res.status(404).json({ is_success: false, message: "신청을 찾을 수 없습니다." });
    }

    return res.json({ is_success: true, estimate: estimateToSave });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ is_success: false, message: "견적 저장 실패" });
  }
});

/** [POST] /api/request/:id/estimate/preview
 *  견적 JSON을 받아 PDF로 미리보기 응답
 *  (pdfkit 필요: npm i pdfkit)
 */
router.post("/:id/estimate/preview", async (req: Request, res: Response) => {
  try {
    const decoded = ensureAuthed(req, res);
    if (!decoded) return;

    const requestId = Number(req.params.id);
    if (!requestId) {
      return res.status(400).json({ is_success: false, message: "유효하지 않은 id" });
    }

    const body = req.body as EstimatePayload;
    if (!body || !Array.isArray(body.items)) {
      return res.status(400).json({ is_success: false, message: "잘못된 견적 데이터" });
    }

    // ---- 합계 재검증 ----
    const sum = body.items.reduce((acc, it) => acc + n(it?.amount), 0);
    const included = !!body.vat_included;
    const rate = Number(body.vat_rate) === 0.1 ? 0.1 : 0;
    const totals = calcTotals(sum, rate, included);

    // ---- PDF 응답 헤더 ----
    const todayStr = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="estimate-${requestId}-${todayStr}.pdf"`);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 56, left: 40, right: 40, bottom: 56 },
      bufferPages: true, // 페이지 번호 넣기 위해 버퍼링
    });

    // 스트림 에러 안전장치
    doc.on("error", (e) => {
      try { res.end(); } catch { }
      console.error("PDF stream error:", e);
    });

    doc.pipe(res);

    // ---- 폰트 ----
    registerKoreanFonts(doc);
    const KR = (bold = false) => useKR(doc, bold);

    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const startX = doc.page.margins.left;

    // ===== 제목 & 기본 정보 =====
    KR(true);
    doc.fontSize(20).text(body.title || "견적서", { align: "center" }).moveDown(0.2);
    KR(false);
    doc.fontSize(10).fillColor("#666")
      .text(`견적일자: ${body.issue_date || "-"}`, startX, doc.y, { align: "right", width: pageW })
      .fillColor("#000")
      .moveDown(0.6);

    // ===== 공급자/수요자 박스 =====
    const boxH = 120;
    const gap = 12;
    const colW = (pageW - gap) / 2;
    const topY = doc.y;

    const drawPartyBox = (title: string, p: PartyInfo, x: number) => {
      doc.roundedRect(x, topY, colW, boxH, 6).stroke();
      KR(true); doc.fontSize(11).text(title, x + 10, topY + 8); KR(false);
      doc.fontSize(9);
      const lines = [
        `상호/기관명: ${p?.name || "-"}`,
        `대표자: ${p?.ceo || "-"}`,
        `담당자: ${p?.charge_name || "-"}`,
        `연락처: ${p?.contact || "-"}`,
        `이메일: ${p?.email || "-"}`,
        `사업자번호: ${p?.biz_no || "-"}`,
        `주소: ${p?.address || "-"}`,
      ];
      let ly = topY + 28;
      lines.forEach((t) => { doc.text(t, x + 10, ly, { width: colW - 20 }); ly += 12; });
    };
    drawPartyBox("공급자", body.supplier || {}, startX);
    drawPartyBox("공급받는자", body.client || {}, startX + colW + gap);

    doc.moveDown(0.6);
    doc.y = topY + boxH + 14;

    // ===== 테이블 =====
    const thBg = "#f3f4f6";
    const stroke = (x1: number, y1: number, x2: number, y2: number) =>
      doc.moveTo(x1, y1).lineTo(x2, y2).stroke();

    // ✅ UI와 동일한 열 구조 (detail 포함)
    const COLS = [
      { key: "name", label: "품명", w: 120, align: "left" as const },
      { key: "detail", label: "세부 공사내역", w: 180, align: "left" as const },
      { key: "qty", label: "수량", w: 50, align: "right" as const },
      { key: "unit", label: "단위", w: 50, align: "center" as const },
      { key: "unit_price", label: "단가", w: 90, align: "right" as const },
      { key: "amount", label: "금액", w: 90, align: "right" as const },
      { key: "note", label: "비고", w: 80, align: "left" as const },
    ];
    // 전체 폭 맞추기(원하면 w를 조정해도 됨)
    const totalColsW = COLS.reduce((a, c) => a + c.w, 0);
    const scale = pageW / totalColsW;
    const COLS_SCALED = COLS.map(c => ({ ...c, w: Math.floor(c.w * scale) }));
    const headerHeight = 22;
    const rowPadX = 6;
    const rowPadY = 4;

    let tableY = doc.y;

    const drawHeader = () => {
      let x = startX;
      // 헤더 배경
      doc.save().rect(startX, tableY, pageW, headerHeight).fill(thBg).restore().stroke();
      KR(true); doc.fontSize(10);
      COLS_SCALED.forEach((c) => {
        doc.text(c.label, x + rowPadX, tableY + 5, { width: c.w - rowPadX * 2, align: c.align });
        x += c.w;
      });
      tableY += headerHeight;
      stroke(startX, tableY, startX + pageW, tableY);
    };

    const formatCell = (v: any, key: string) => {
      if (key === "unit_price" || key === "amount") return n(v).toLocaleString();
      if (key === "qty") return v != null ? String(v) : "";
      if (v == null) return "";
      return String(v);
    };

    const ensurePage = (needHeight: number) => {
      const usableBottom = doc.page.height - doc.page.margins.bottom - 140; // 합계 카드 자리 여유
      if (tableY + needHeight > usableBottom) {
        doc.addPage();
        KR(false);
        tableY = doc.y;
        drawHeader();
      }
    };

    // 헤더
    drawHeader();

    // 행
    KR(false); doc.fontSize(9);
    for (const it of body.items) {
      // 각 셀 높이 계산 (실제 줄바꿈 반영)
      let rowHeight = 0;
      let x = startX;

      // 먼저 높이 계산
      COLS_SCALED.forEach((c) => {
        const text = formatCell((it as any)[c.key], c.key);
        const h = doc.heightOfString(text, {
          width: c.w - rowPadX * 2,
          align: c.align,
        });
        rowHeight = Math.max(rowHeight, Math.max(h + rowPadY * 2, 20)); // 최소 20
      });

      ensurePage(rowHeight);

      // 셀 그리기
      x = startX;
      COLS_SCALED.forEach((c) => {
        const text = formatCell((it as any)[c.key], c.key);
        doc.text(text, x + rowPadX, tableY + rowPadY, {
          width: c.w - rowPadX * 2,
          align: c.align,
        });
        x += c.w;
      });

      tableY += rowHeight;
      // 행 하단 선
      stroke(startX, tableY, startX + pageW, tableY);
    }

    // ===== 합계 카드 (오른쪽) =====
    const cardW = 260;
    const cardH = 84;
    const cardX = startX + pageW - cardW;
    let cardY = tableY + 14;

    if (cardY + cardH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      KR(false);
      cardY = doc.y;
    }

    doc.roundedRect(cardX, cardY, cardW, cardH, 8).stroke();
    const cardLine = (label: string, val: number, bold?: boolean) => {
      if (bold) KR(true); else KR(false);
      doc.text(label, cardX + 12, cardY + 10, { width: 120, align: "left" });
      KR(false);
      doc.text(`${val.toLocaleString()} 원`, cardX + 120, cardY + 10, { width: cardW - 132, align: "right" });
      cardY += 26;
    };
    cardLine("소계", totals.subtotal);
    cardLine(`부가세${rate ? " (10%)" : ""}${included ? " · 포함가 역산" : ""}`, totals.vat);
    cardLine("합계", totals.total, true);

    // ===== 메모 =====
    if (body.memo) {
      doc.moveDown(1.2);
      KR(true); doc.text("비고 / 특약", startX, doc.y); KR(false);
      doc.fontSize(9).text(String(body.memo), startX, doc.y + 6, { width: pageW });
    }

    // ===== 페이지 번호 =====
    const addPageNumbers = () => {
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        KR(false);
        doc.fontSize(8).fillColor("#666").text(
          `${i + 1} / ${range.count}`,
          0,
          doc.page.height - doc.page.margins.bottom + 24,
          { align: "center", width: doc.page.width }
        ).fillColor("#000");
      }
    };
    addPageNumbers();

    doc.end();
  } catch (err) {
    console.error(err);
    // 스트림이 이미 시작된 경우를 대비해 try-catch
    try {
      return res.status(500).json({ is_success: false, message: "PDF 생성 실패" });
    } catch {
      // ignore
    }
  }
});




export default router;