import { Router, Request, Response } from "express";

import dotenv from "dotenv";
import { Transaction, Op, WhereOptions } from "sequelize";
import * as jwt from 'jsonwebtoken';
import { sendEmail } from "../lib/mailer";
import { auth } from "../middlewares/auth";
const { Company, User, ServiceRequest, Assignment, sequelize } = require("../../models");

dotenv.config();
type Secret = jwt.Secret;
const router = Router();
const ACCESS_SECRET: Secret = (process.env.JWT_ACCESS_SECRET ?? 'dev-access') as Secret;

// 상태 매핑 (구 UI 호환)
const UI_TO_DB: Record<string, "PENDING" | "APPROVED" | "REJECTED" | undefined> = {
  submitted: "PENDING",
  reviewing: "PENDING", // 별도 상태가 없으므로 PENDING으로 묶음
  approved: "APPROVED",
  rejected: "REJECTED",
};

//업체 저장하기
router.post("/save", async (req: Request, res: Response) => {
  let tx: Transaction | null = null;
  try {
    const {
      name,         // 기업명
      ceo,            //대표명
      biz_no,         //사업자번호
      corp_no,        //법인번호
      start_date,     //설립일
      company_type,   //회사형태
      post_code,      //우편번호
      address,        //주소
      address_detail,  //상세주소
      lat,             //위도
      lng,             //경도
      tel,            //연락처
      fax,            //팩스번호
      email,          //이메일
      homepage,      //홈페이지
      regions,            //주력 지역
      certs,              //자격증/경력
      documents,          //첨부파일
    } = req.body;
    const bearer = req.headers.authorization;
    const fromHeader = bearer?.startsWith('Bearer ') ? bearer.split(' ')[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);

    if (!token) return res.status(401).json({ is_success: false, message: '인증 토큰이 필요합니다.' });

    const decoded = jwt.verify(token, ACCESS_SECRET) as any; // sub, role 등
    const user = await User.findByPk(decoded.sub);
    if (!user) return res.status(401).json({ is_success: false, message: '유효하지 않은 토큰입니다.' });
    const owner_user_id = user?.get('id');
     await Company.create({
      name,         // 기업명
      ceo,            //대표명
      biz_no,         //사업자번호
      corp_no,        //법인번호
      start_date,     //설립일
      company_type,   //회사형태
      post_code,      //우편번호
      address,        //주소
      address_detail,  //상세주소
      lat,             //위도
      lng,             //경도
      tel,            //연락처
      fax,            //팩스번호
      email,          //이메일
      homepage,      //홈페이지
      regions,            //주력 지역
      certs,              //자격증/경력
      documents,          //첨부파일
      owner_user_id
    });
    const html = `
      <h3>${name} 정보</h3>
      <p>대표:${ceo}</p>
      <p>주소:${post_code}<br/>${address}<br/>${address}</p>
      <p>연락처:tel.${tel} fax.${fax}</p>
      <p>이메일:${email}</p>
    `;
    await sendEmail({
      to:'kimnamhyong@gmail.com',
      subject:'기업신청',
      html
    });
    return res.json({ is_success: true, msg: '저장 성공' });
  } catch (error: any) {
    console.log(error);
    return res.status(401).json({ is_success: false, msg: '저장 실패' });
  }
});

// 목록 조회
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

   
    // ====== Query Params ======
    const {
      q = "",
      status,
      page = "1",
      page_size = "10",
      order_by = "createdAt",
      order_dir = "DESC",
      regions, // ⬅️ 추가: "부산>해운대구,부산>금정구" 또는 ["부산>해운대구",...]
    } = req.query as Record<string, any>;

    const pageNum = Math.max(parseInt(page || "1", 10) || 1, 1);
    const pageSizeNum = Math.min(Math.max(parseInt(page_size || "10", 10) || 10, 1), 100);

    // ====== 상태 매핑 ======
    const KOR_TO_DB: Record<string, "PENDING" | "APPROVED" | "REJECTED" | undefined> = {
      "대기": "PENDING",
      "승인": "APPROVED",
      "중지": "REJECTED",
    };
    const ENG_TO_DB: Record<string, "PENDING" | "APPROVED" | "REJECTED" | undefined> = {
      "PENDING": "PENDING",
      "APPROVED": "APPROVED",
      "REJECTED": "REJECTED",
    };
    const UI_TO_DB: Record<string, "PENDING" | "APPROVED" | "REJECTED" | undefined> = {
      submitted: "PENDING",
      reviewing: "PENDING",
      approved: "APPROVED",
      rejected: "REJECTED",
    };

    let mappedStatus: "PENDING" | "APPROVED" | "REJECTED" | undefined;
    if (status) {
      const key = String(status).trim();
      mappedStatus =
        KOR_TO_DB[key] ||
        ENG_TO_DB[key.toUpperCase()] ||
        UI_TO_DB[key.toLowerCase()];
    }

    // ====== regions 파싱 ======
    // regions=a,b,c 또는 regions[]=a&regions[]=b 모두 지원
    let regionKeys: string[] = [];
    if (Array.isArray(regions)) {
      regionKeys = regions.filter(Boolean).map((s: string) => String(s).trim());
    } else if (typeof regions === "string" && regions.trim()) {
      regionKeys = regions
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // ====== where 조건 조립 (AND 묶음 권장) ======
    const andConds: any[] = [];

    // 검색어
    if (q && q.trim()) {
      const like = `%${q.trim()}%`;
      andConds.push({
        [Op.or]: [
          { name: { [Op.like]: like } },
          { ceo: { [Op.like]: like } },
          { biz_no: { [Op.like]: like } },
          { corp_no: { [Op.like]: like } },
        ],
      });
    }

    // 상태
    if (mappedStatus) {
      andConds.push({ status: mappedStatus });
    }

    // ====== 지역 필터 (JSON 컬럼) ======
    // 1) MySQL 8.0.17+ : JSON_OVERLAPS(regions, '["a","b"]') = 1
    // 2) 호환 방식 : OR(JSON_CONTAINS(regions, '"a"'), JSON_CONTAINS(regions, '"b"'), ...)
    if (regionKeys.length > 0) {
      const colRegions = sequelize.col("regions");

      // 선호: JSON_OVERLAPS (가능하면 이 한 줄로 처리)
      const overlapsCond = sequelize.where(
        sequelize.fn("JSON_OVERLAPS", colRegions, JSON.stringify(regionKeys)),
        1
      );

      // 대안: JSON_CONTAINS OR 묶음
      const containsOrConds = regionKeys.map((key) =>
        sequelize.where(
          sequelize.fn("JSON_CONTAINS", colRegions, JSON.stringify(key)),
          1
        )
      );

      // 둘 중 하나라도 만족하면 OK
      andConds.push({
        [Op.or]: [
          overlapsCond,
          { [Op.or]: containsOrConds },
        ],
      });
    }

    const where: any = andConds.length > 0 ? { [Op.and]: andConds } : {};

    // ====== 정렬 안전 처리 ======
    const ORDERABLE = new Set(["createdAt", "updatedAt", "name", "status", "start_date"]);
    const orderField = ORDERABLE.has(order_by) ? order_by : "createdAt";
    const orderDir = order_dir?.toUpperCase() === "ASC" ? "ASC" : "DESC";

    // ====== 페이징 ======
    const offset = (pageNum - 1) * pageSizeNum;
    const { rows, count } = await Company.findAndCountAll({
      where,
      order: [[orderField, orderDir]],
      limit: pageSizeNum,
      offset,
      // attributes: ['id','name','ceo','biz_no','tel','address','status','homepage','email','regions'],
    });

    const totalPages = Math.max(1, Math.ceil(count / pageSizeNum));

    return res.json({
      is_success: true,
      items: rows,
      page: pageNum,
      page_size: pageSizeNum,
      total: count,
      total_pages: totalPages,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ is_success: false, message: "목록 조회 실패" });
  }
});

// 상태변경
router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    // 인증 동일
    const bearer = req.headers.authorization;
    const fromHeader = bearer?.startsWith("Bearer ") ? bearer.split(" ")[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);
    if (!token) return res.status(401).json({ is_success: false, message: "인증 토큰이 필요합니다." });
    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    const user = await User.findByPk(decoded.sub);
    if (!user) return res.status(401).json({ is_success: false, message: "유효하지 않은 토큰입니다." });

    const id = Number(req.params.id);
    const { status } = req.body as { status?: "PENDING"|"APPROVED"|"REJECTED" };

    if (!id || !status) return res.status(400).json({ is_success:false, message:"id/status 필요" });
    if (!["PENDING","APPROVED","REJECTED"].includes(status))
      return res.status(400).json({ is_success:false, message:"잘못된 상태값" });

    const company = await Company.findByPk(id);
    if (!company) return res.status(404).json({ is_success:false, message:"존재하지 않는 업체" });

    const curr: "PENDING"|"APPROVED"|"REJECTED" = company.status;

    // 전이 규칙
    const ALLOWED: Record<typeof curr, Array<"PENDING"|"APPROVED"|"REJECTED">> = {
      PENDING:  ["APPROVED","REJECTED"],
      APPROVED: [], // 변경 불가
      REJECTED: ["PENDING","APPROVED"],
    } as const;

    if (!ALLOWED[curr].includes(status)) {
      return res.status(400).json({ is_success:false, message:`${curr} → ${status} 전환 불가` });
    }

    await company.update({ status });
    return res.json({ is_success:true, message:"상태 변경 완료", item: company });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ is_success:false, message:"상태 변경 실패" });
  }
});
//삭제
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    // 인증 로직 (list/save와 동일)
    const bearer = req.headers.authorization;
    const fromHeader = bearer?.startsWith("Bearer ") ? bearer.split(" ")[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);
    if (!token) return res.status(401).json({ is_success: false, message: "인증 토큰이 필요합니다." });

    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    const user = await User.findByPk(decoded.sub);
    if (!user) return res.status(401).json({ is_success: false, message: "유효하지 않은 토큰입니다." });

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ is_success: false, message: "id가 필요합니다." });

    const company = await Company.findByPk(id);
    if (!company) return res.status(404).json({ is_success: false, message: "존재하지 않는 업체입니다." });

    await company.destroy(); // paranoid: true → soft delete
    return res.json({ is_success: true, message: "삭제되었습니다." });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ is_success: false, message: "삭제 실패" });
  }
});
//승인된 업체 불러오기(업체회원)
// ✅ 미들웨어 붙이기
router.get("/companies", auth(), async (req: Request, res: Response) => {
  try {
    const me = (req as any).user; // ← auth() 가 넣어준 사용자
    if (!me?.id) {
      return res.status(401).json({ is_success: false, message: "인증 실패" });
    }

    const items = await Company.findAll({
      where: { owner_user_id: me.id, status: "APPROVED" },
      // 필요 시 사용자 정보도 함께:
      // include: [{ model: User, as: 'owner', attributes: ['id','email','name','role'] }],
    });

    return res.json({ is_success: true, items });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ is_success: false, message: "조회 실패" });
  }
});
// router.get("/companies",auth(), async (req: Request, res: Response) => {
//   try {
//     // 인증 로직 (list/save와 동일)
//     const bearer = req.headers.authorization;
//     const fromHeader = bearer?.startsWith("Bearer ") ? bearer.split(" ")[1] : undefined;
//     const token = fromHeader || (req.cookies?.access_token as string | undefined);
//     if (!token) return res.status(401).json({ is_success: false, message: "인증 토큰이 필요합니다." });
//     console.log(token);
//     const decoded = jwt.verify(token, ACCESS_SECRET) as any;
//     const user = await User.findByPk(decoded.sub);
//     if (!user) return res.status(401).json({ is_success: false, message: "유효하지 않은 토큰입니다." });
//     const owner_user_id = user?.id;
//     const items=await Company.findAll({
//       where:{
//         owner_user_id,
//         status:'APPROVED'
//       }
//     })
   
//     return res.json({ is_success: true, items});
//   } catch (e) {
//     console.error(e);
//     return res.status(500).json({ is_success: false, message: "삭제 실패" });
//   }
// });

export default router;