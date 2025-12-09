// src/routes/qna.ts (예시)
// 라우터 파일 이름은 프로젝트 구조에 맞게 사용하세요.
import { Router, Request, Response } from "express";
import dotenv from "dotenv";
import * as jwt from "jsonwebtoken";
import { UniqueConstraintError,Op  } from "sequelize";
// 알림 메일을 쓰지 않으면 주석 처리 가능
import { sendEmail } from "../lib/mailer";
function nl2br(str:string) {
  if (str == null) return '';
  return String(str).replace(/\r\n|\n\r|\r|\n/g, '<br>');
}
// 🔹 models/index.js에서 PostQna를 export 했다고 가정
const { PostQna, PostQnaComment, sequelize, User } = require("../../models");

dotenv.config();
type Secret = jwt.Secret;

const router = Router();
const ACCESS_SECRET: Secret = (process.env.JWT_ACCESS_SECRET ?? "dev-access") as Secret;

/**
 * POST /api/qna/save
 * body(JSON):
 * {
 *   "type": "불만사항",               // 카테고리(서비스 신청|변경|취소|불만사항|제안)
 *   "org_name": "○○시 노인복지관",
 *   "manager_name": "홍길동",
 *   "tel": "02-1234-5678",
 *   "email": "test@test.com",
 *   "title": "에어컨 소음 점검 요청",
 *   "content": "상세 내용...",
 *   "files": [ { "id":123, "url":"https://.../a.pdf", "name":"a.pdf", "size":1024, "type":"application/pdf" } ],
 *   "user_id": 2 // 선택(클라이언트가 보냈다면 무시하고 토큰의 sub를 사용)
 * }
 */
router.post("/save", async (req: Request, res: Response) => {
  // --- 인증 ---
    const bearer = req.headers.authorization;
    const fromHeader = bearer?.startsWith('Bearer ') ? bearer.split(' ')[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);
    // if (!token) return res.status(401).json({ is_success: false, message: '인증 토큰이 필요합니다.' });
    let decoded = null;
    let user = null;
    if(token){
      decoded = jwt.verify(token, ACCESS_SECRET) as any;
      user = await User.findByPk(decoded.sub);
    }
    
     
    // if (!user) return res.status(401).json({ is_success: false, message: '유효하지 않은 토큰입니다.' });
  // 입력값
  const {
    type, // 카테고리
    org_name,
    manager_name,
    tel,
    email,
    password,
    title,
    content,
    files,
  } = req.body || {};

  // 간단 유효성 검사
  if (!type || !title || !content) {
    return res.status(400).json({
      is_success: false,
      message: "type, title, content는 필수입니다.",
    });
  }

  // 카테고리 값 제한(모델 ENUM과 동일)
  const ALLOWED = ["서비스 신청", "변경", "취소", "불만사항", "제안"];
  if (!ALLOWED.includes(type)) {
    return res.status(400).json({
      is_success: false,
      message: `category(type)은 ${ALLOWED.join(", ")} 중 하나여야 합니다.`,
    });
  }

  // 파일은 배열이거나 undefined
  let safeFiles: any[] = [];
  if (files !== undefined) {
    if (!Array.isArray(files)) {
      return res.status(400).json({ is_success: false, message: "files는 배열이어야 합니다." });
    }
    // 최소한의 스키마 클린업
    safeFiles = files.map((f: any) => ({ 
      id: f?.id ?? null, 
      url: f?.url ?? "",
      name: f?.name ?? "",
      size: typeof f?.size === "number" ? f.size : null,
      type: f?.type ?? null,
    }));
  }

  // 기관/담당자/연락처/이메일을 모델에 별도 컬럼 없이 content 상단에 머지 저장(요청 사양)
  const mergedContent =
    `[기관명] ${org_name ?? ""}\n` +
    `[담당자] ${manager_name ?? ""}\n` +
    `[연락처] ${tel ?? ""}\n` +
    `[이메일] ${email ?? ""}\n\n` +
    (content ?? "");

  const t = await sequelize.transaction();
  try {
    const client_id = user?.id??0;

    // 저장
    const created = await PostQna.create(
      {
        client_id,
        category: type,
        user_email:email,
        title: String(title).trim(),
        merged_content: mergedContent,
        content,
        files: safeFiles, // JSON 컬럼
        status: "NEW",
        is_private: true,
        comment_count: 0,
        last_commented_at: null,
      },
      { transaction: t }
    );

    await t.commit();

    // 선택: 관리자에게 알림 메일
    try {
      if (process.env.ADMIN_EMAIL) {
        await sendEmail({
          to: process.env.ADMIN_EMAIL,
          subject: `[QnA] 신규 문의 - ${created.title}`,
          html: `
            <h3>신규 문의 접수</h3>
            <p><b>분류:</b> ${type}</p>
            <p><b>제목:</b> ${created.title}</p>
            <pre style="white-space:pre-wrap">${mergedContent}</pre>
          `,
        });
      }
    } catch (e) {
      // 메일 실패는 저장 성공과 분리(로그만)
      console.warn("[QNA MAIL FAIL]", e);
    }

    return res.json({
      is_success: true,
      post_id: created.id,
    });
  } catch (err: any) {
    await t.rollback();
    if (err instanceof UniqueConstraintError) {
      return res.status(400).json({ is_success: false, message: "중복 데이터가 있습니다." });
    }
    console.error("[QNA SAVE ERROR]", err);
    return res.status(500).json({ is_success: false, message: "저장 중 오류가 발생했습니다." });
  }
});
// 추가: 내 문의 목록 (본인 것만)
router.get("/list", async (req: Request, res: Response) => {
  // --- 인증 ---
    const bearer = req.headers.authorization;
    const fromHeader = bearer?.startsWith('Bearer ') ? bearer.split(' ')[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);
    if (!token) return res.status(401).json({ is_success: false, message: '로그인 후 이용이 가능합니다.' });

    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    const user = await User.findByPk(decoded.sub);
    if (!user) return res.status(401).json({ is_success: false, message: '로그인 후 이용이 가능합니다.' });

  // 아주 심플한 페이징만 유지(옵션)
  const page = Math.max(1, Number(req.query.page ?? 1));
  const page_size = Math.min(100, Math.max(1, Number(req.query.page_size ?? 20)));
  const limit = page_size;
  const offset = (page - 1) * page_size;

  try {
    const where = { client_id: user?.id };

    const { rows, count } = await PostQna.findAndCountAll({
      where,
      attributes: ["id", "title", "category", "status", "comment_count", "createdAt", "last_commented_at"],
      limit,
      offset,
      // last_commented_at가 있는 글을 먼저, 없으면 createdAt 기준 내림차순
      order: [
        // NULLS LAST 대체: IS NULL ASC → NOT NULL 먼저
        [sequelize.literal("last_commented_at IS NULL"), "ASC"],
        ["last_commented_at", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    return res.json({
      is_success: true,
      items: rows,
      total: count,
      page,
      page_size,
    });
  } catch (err) {
    console.error("[QNA LIST ERROR]", err);
    return res.status(500).json({ is_success: false, message: "목록 조회 중 오류가 발생했습니다." });
  }
});
// 상세보기: 본문 + 첨부 + 댓글
router.get("/detail/:id", async (req: Request, res: Response) => {
  // --- 인증 ---
    const bearer = req.headers.authorization;
    const fromHeader = bearer?.startsWith('Bearer ') ? bearer.split(' ')[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);
    if (!token) return res.status(401).json({ is_success: false, message: '인증 토큰이 필요합니다.' });

    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    const user = await User.findByPk(decoded.sub);
    if (!user) return res.status(401).json({ is_success: false, message: '유효하지 않은 토큰입니다.' });

  const id = Number(req.params.id);
  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ is_success: false, message: "유효한 ID가 아닙니다." });
  }

  try {
    const isAdmin = user?.role === "ADMIN" || user?.role === "STAFF";

    // 본인 글 또는 관리자 권한
    const where: any = { id };
    if (!isAdmin) where.client_id = Number(user?.id);

    const post = await PostQna.findOne({
      where,
      attributes: [
        "id",
        "client_id",
        "category",
        "title",
        "merged_content",
        "files",              // JSON 컬럼
        "status",
        "comment_count",
        "createdAt",
        "last_commented_at",
        "is_private",
      ],
    });

    if (!post) {
      return res.status(404).json({ is_success: false, message: "게시글을 찾을 수 없습니다." });
    }

    // 댓글: 오래된 순서
    const comments = await PostQnaComment.findAll({
      where: { post_id: id },
      attributes: ["id", "post_id", "body", "author_role", "author_user_id", "createdAt"],
      order: [["createdAt", "ASC"]],
    });

    return res.json({
      is_success: true,
      item: post,
      comments,
    });
  } catch (err) {
    console.error("[QNA DETAIL ERROR]", err);
    return res.status(500).json({ is_success: false, message: "상세 조회 중 오류가 발생했습니다." });
  }
});


// 관리자용 목록
router.get("/admin/list", async (req: Request, res: Response) => {
  // --- 인증 ---
    const bearer = req.headers.authorization;
    const fromHeader = bearer?.startsWith('Bearer ') ? bearer.split(' ')[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);
    if (!token) return res.status(401).json({ is_success: false, message: '인증 토큰이 필요합니다.' });

    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    const user = await User.findByPk(decoded.sub);
    if (!user) return res.status(401).json({ is_success: false, message: '유효하지 않은 토큰입니다.' });


  // 쿼리 파라미터
  const page = Math.max(1, Number(req.query.page ?? 1));
  const page_size = Math.min(100, Math.max(1, Number(req.query.page_size ?? 20)));
  const status = (req.query.status as string | undefined) || "";
  const category = (req.query.category as string | undefined) || "";
  const q = (req.query.q as string | undefined)?.trim() || "";

  const limit = page_size;
  const offset = (page - 1) * page_size;

  // where 생성
  const where: any = {};
  if (status) where.status = status; // 'NEW' | 'ANSWERED' | 'REOPENED' | 'CLOSED'
  if (category) where.category = category; // '서비스 신청' | '변경' | ...

  // 키워드: 제목/작성자명/기관명(inst)
  // utf8mb4_general_ci 이면 LIKE로도 대소문자 무시 매칭 가능
  if (q) {
    where[Op.or] = [
      { title: { [Op.like]: `%${q}%` } },
      { "$author.name$": { [Op.like]: `%${q}%` } },
      { "$author.inst$": { [Op.like]: `%${q}%` } },
    ];
  }

  try {
    const { rows, count } = await PostQna.findAndCountAll({
      where,
      
      attributes: [
        "id",
        "title",
        "category",
        "status",
        "comment_count",
        "createdAt",
        "last_commented_at",
      ],
      limit,
      offset,
      order: [
        [sequelize.literal("last_commented_at IS NULL"), "ASC"], // NOT NULL 우선
        ["last_commented_at", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    // 응답 형태: 관리자 UI에서 쓰던 필드로 매핑
    const items = rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      status: r.status,
      comment_count: r.comment_count ?? 0,
      createdAt: r.createdAt,
      last_commented_at: r.last_commented_at,
      author_name: r.author?.name ?? null,
      author_org: r.author?.inst ?? null,
    }));

    return res.json({
      is_success: true,
      items,
      total: count,
      page,
      page_size,
    });
  } catch (err) {
    console.error("[ADMIN QNA LIST ERROR]", err);
    return res.status(500).json({ is_success: false, message: "목록 조회 중 오류가 발생했습니다." });
  }
});

// ==============================
// 댓글 저장: POST /api/qna/comment
// body: { post_id:number, body:string }
// ==============================
router.post("/comment", async (req: Request, res: Response) => {
  // --- 인증 ---
    const bearer = req.headers.authorization;
    const fromHeader = bearer?.startsWith('Bearer ') ? bearer.split(' ')[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);
    if (!token) return res.status(401).json({ is_success: false, message: '인증 토큰이 필요합니다.' });

    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    const user = await User.findByPk(decoded.sub);
    if (!user) return res.status(401).json({ is_success: false, message: '유효하지 않은 토큰입니다.' });

  const { post_id, body } = req.body || {};
  const userId = Number(user?.id);
  const role = String(user?.role || "CLIENT"); // 기본 CLIENT 취급

  if (!post_id || !body || !String(body).trim()) {
    return res.status(400).json({ is_success: false, message: "post_id, body는 필수입니다." });
  }
  if (String(body).length > 5000) {
    return res.status(400).json({ is_success: false, message: "댓글은 최대 5000자까지 입력 가능합니다." });
  }

  const t = await sequelize.transaction();
  try {
    // 글 확인 + 접근 권한
    const post: any = await PostQna.findOne({
      where: { id: Number(post_id) },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!post) {
      await t.rollback();
      return res.status(404).json({ is_success: false, message: "게시글을 찾을 수 없습니다." });
    }

    const isAdmin = role === "SUPER" || role === "ADMIN" || role === "STAFF";
    if (!isAdmin && Number(post.client_id) !== userId) {
      await t.rollback();
      return res.status(403).json({ is_success: false, message: "댓글을 작성할 권한이 없습니다." });
    }

    // 댓글 생성
    const comment = await PostQnaComment.create(
      {
        post_id: Number(post_id),
        body: String(body).trim(),
        author_role: isAdmin ? (role === "STAFF" ? "STAFF" : "ADMIN") : "CLIENT",
        author_user_id: userId,
      },
      { transaction: t }
    );

    // 상태/카운트/최근활동 업데이트
    let nextStatus = post.status as "NEW" | "ANSWERED" | "REOPENED" | "CLOSED";
    if (isAdmin) {
      nextStatus = "ANSWERED"; // 운영정책: 관리자가 댓글 달면 ANSWERED
    } else {
      if (post.status === "CLOSED") {
        nextStatus = "REOPENED"; // 고객이 종결글에 댓글 달면 재오픈
      }
      // 필요 시 아래처럼 고객 댓글 시에도 항상 REOPENED로 바꿀 수 있음:
      // else if (post.status === "ANSWERED" || post.status === "NEW") nextStatus = "REOPENED";
    }

    await post.update(
      {
        status: nextStatus,
        comment_count: Number(post.comment_count ?? 0) + 1,
        last_commented_at: new Date(),
      },
      { transaction: t }
    );

    await t.commit();
    console.log(post?.user_email);
    console.log(body);
    if(post.client_id === 0){
     const html = `
      <div style="font-family: Arial, sans-serif; font-size:14px;">
        <p>문의하신 사항을 답변드립니다.</p>
        <p style="margin:16px 0;">
          ${nl2br(post?.content)}
        </p>
        <p>
        답변 <br/>
        ${nl2br(body)}
        </p>
        <p>더 궁금하신 것이 있으시면 한국클린쿱 관리자에게 문의하십시오.</p>
      </div>
    `
      try {
        await sendEmail({
          to: post?.user_email,
          subject: '한국클린쿱 문의 사항에 답변이 왔습니다.',
          html
        });
      } catch (error) {
        console.log(error);
      }
      
    }

    return res.json({
      is_success: true,
      comment: {
        id: comment.id,
        post_id: comment.post_id,
        body: comment.body,
        author_role: comment.author_role,
        author_user_id: comment.author_user_id,
        createdAt: comment.createdAt,
      },
      post: {
        id: post.id,
        status: nextStatus,
        comment_count: Number(post.comment_count ?? 0),
        last_commented_at: post.last_commented_at,
      },
    });
  } catch (err) {
    await t.rollback();
    console.error("[QNA COMMENT SAVE ERROR]", err);
    return res.status(500).json({ is_success: false, message: "댓글 저장 중 오류가 발생했습니다." });
  }
});


// ==============================
// 댓글 목록: GET /api/qna/comments?post_id=123
// (옵션) page, page_size 지원
// ==============================
router.get("/comments", async (req: Request, res: Response) => {
  // --- 인증 ---
    const bearer = req.headers.authorization;
    const fromHeader = bearer?.startsWith('Bearer ') ? bearer.split(' ')[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);
    if (!token) return res.status(401).json({ is_success: false, message: '인증 토큰이 필요합니다.' });

    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    const user = await User.findByPk(decoded.sub);
    if (!user) return res.status(401).json({ is_success: false, message: '유효하지 않은 토큰입니다.' });

  const post_id = Number(req.query.post_id);
  if (!post_id) {
    return res.status(400).json({ is_success: false, message: "post_id는 필수입니다." }); 
  }
  const page = Math.max(1, Number(req.query.page ?? 1));
  const page_size = Math.min(100, Math.max(1, Number(req.query.page_size ?? 50)));
  const limit = page_size;
  const offset = (page - 1) * page_size;

  try {
    // 권한 확인(본인글 또는 관리자)
    const role = String(user?.role || "CLIENT");
    const isAdmin = role === "SUPER" || role === "ADMIN" || role === "STAFF";
    const post: any = await PostQna.findOne({
      where: { id: post_id },
      attributes: ["id", "client_id", "is_private"],
    });
    if (!post) {
      return res.status(404).json({ is_success: false, message: "게시글을 찾을 수 없습니다." });
    }
    if (!isAdmin && Number(post.client_id) !== Number(user?.id)) {
      return res.status(403).json({ is_success: false, message: "조회 권한이 없습니다." });
    }

    const { rows, count } = await PostQnaComment.findAndCountAll({
      where: { post_id },
      attributes: ["id", "post_id", "body", "author_role", "author_user_id", "createdAt"],
      order: [["createdAt", "ASC"]],
      limit,
      offset,
    });

    return res.json({
      is_success: true,
      items: rows,
      total: count,
      page,
      page_size,
    });
  } catch (err) {
    console.error("[QNA COMMENTS LIST ERROR]", err);
    return res.status(500).json({ is_success: false, message: "댓글 목록 조회 중 오류가 발생했습니다." });
  }
});
// 댓글 삭제: DELETE /api/qna/comment/:id
router.delete("/comment/:id", async (req: Request, res: Response) => {
  // --- 인증 ---
    const bearer = req.headers.authorization;
    const fromHeader = bearer?.startsWith('Bearer ') ? bearer.split(' ')[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);
    if (!token) return res.status(401).json({ is_success: false, message: '인증 토큰이 필요합니다.' });

    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    const user = await User.findByPk(decoded.sub);
    if (!user) return res.status(401).json({ is_success: false, message: '유효하지 않은 토큰입니다.' });

  const commentId = Number(req.params.id);
  if (!commentId || Number.isNaN(commentId)) {
    return res.status(400).json({ is_success: false, message: "유효한 댓글 ID가 아닙니다." });
  }

  const t = await sequelize.transaction();
  try {
    // 1) 댓글 조회
    const cmt: any = await PostQnaComment.findOne({
      where: { id: commentId },
      attributes: ["id", "post_id", "author_user_id", "createdAt"],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!cmt) {
      await t.rollback();
      return res.status(404).json({ is_success: false, message: "댓글을 찾을 수 없습니다." });
    }

    // 2) 본인 확인
    if (Number(cmt.author_user_id) !== Number(user?.id)) {
      await t.rollback();
      return res.status(403).json({ is_success: false, message: "본인 댓글만 삭제할 수 있습니다." });
    }

    // 3) 부모 글 조회(카운트/최근활동 갱신용)
    const post: any = await PostQna.findOne({
      where: { id: cmt.post_id },
      attributes: ["id", "comment_count"],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!post) {
      await t.rollback();
      return res.status(404).json({ is_success: false, message: "게시글을 찾을 수 없습니다." });
    }

    // 4) 댓글 삭제
    await PostQnaComment.destroy({ where: { id: commentId }, transaction: t });

    // 5) comment_count 감소
    const nextCount = Math.max(0, Number(post.comment_count ?? 0) - 1);

    // 6) last_commented_at 재계산(남은 댓글 중 가장 최신)
    const last = await PostQnaComment.findOne({
      where: { post_id: post.id },
      attributes: ["createdAt"],
      order: [["createdAt", "DESC"]],
      transaction: t,
    });
    const nextLast = last ? last.createdAt : null;

    await post.update(
      {
        comment_count: nextCount,
        last_commented_at: nextLast,
      },
      { transaction: t }
    );

    await t.commit();

    return res.json({
      is_success: true,
      post: {
        id: post.id,
        comment_count: nextCount,
        last_commented_at: nextLast,
      },
    });
  } catch (err) {
    await t.rollback();
    console.error("[QNA COMMENT DELETE ERROR]", err);
    return res.status(500).json({ is_success: false, message: "댓글 삭제 중 오류가 발생했습니다." });
  }
});

export default router;
