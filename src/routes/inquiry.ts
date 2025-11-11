import { Router, Request, Response } from "express";

import dotenv from "dotenv";
import {Op, Transaction} from 'sequelize';
import * as jwt from 'jsonwebtoken';
const { Inquiry,ServiceRequest,Company,InquiryComment,User,sequelize} = require("../../models");
export type InquiryStatus = 'OPEN' | 'ANSWERED' | 'CLOSED';
dotenv.config();
type Secret = jwt.Secret; 
const ACCESS_SECRET: Secret = (process.env.JWT_ACCESS_SECRET ?? 'dev-access') as Secret;
export type InquiryRow = {
  id: number;
  title: string;
  status: InquiryStatus;
  content: string;
  service_request_id: number | null;
  requester_user_id: number;
  company_id: number | null;
  createdAt: string;
  updatedAt: string;

  // 조인된 표시용(있으면)
  service_org_name?: string | null;
  service_contact_name?: string | null;
  company_name?: string | null;
  company_phone?: string | null;
  requester_name?: string | null;
  requester_email?: string | null;
};

export type InquiryListResponse = {
  is_success: boolean;
  items: InquiryRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

dotenv.config();

const router = Router();
router.get('/list', async (req:Request, res:Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '10'), 10) || 10));

    const status = String(req.query.status ?? '').trim().toUpperCase();
    const service_request_id = req.query.service_request_id ? Number(req.query.service_request_id) : null;
    const company_id = req.query.company_id ? Number(req.query.company_id) : null;
    
    const q = String(req.query.q ?? '').trim();

    const requester_user_id = (req as any).user?.id ?? Number(req.query.requester_user_id); 
    
 

    const where: any = { service_request_id };
    if (status && ['OPEN', 'ANSWERED', 'CLOSED'].includes(status)) where.status = status;
    if (requester_user_id) where.requester_user_id = requester_user_id;
    if (company_id) where.company_id = company_id;
    if (q) {
      where[Op.or] = [
        { title: { [Op.like]: `%${q}%` } },
        { content: { [Op.like]: `%${q}%` } },
      ];
    }

    const { rows, count } = await Inquiry.findAndCountAll({
      where,
      include: [
        { model: ServiceRequest, as: 'serviceRequest', attributes: ['id', 'org_name', 'contact_name'] },
        { model: Company, as: 'company', attributes: ['id', 'name', 'phone'] },
        { model: User, as: 'requester', attributes: ['id', 'name', 'email'] },
      ],
      order: [['createdAt', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });

    const total = count;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return res.json({
      is_success: true,
      items: rows,
      page,
      pageSize,
      total,
      totalPages,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ is_success: false, message: '서버 오류' });
  }
});
//업체 저장하기
router.post("/save", async (req: Request, res: Response) => {
    try {
        const {
            title,
            content,
            service_request_id = null,
            requester_user_id,
            company_id = null,
        } = req.body ?? {};

        if (!title || !content) {
            return res.status(400).json({ is_success: false, message: 'title, content 필수' });
        }
        if (!requester_user_id) {
            return res.status(400).json({ is_success: false, message: 'requester_user_id 필수' });
        }

        // (선택) FK 존재여부 간단 검증
        // const user = await User.findByPk(requester_user_id);
        // if (!user) return res.status(404).json({ is_success: false, message: '작성자 없음' });
        const item = await Inquiry.create({
            title,
            status: 'OPEN',
            content,
            service_request_id,
            requester_user_id,
            company_id,
        });

        return res.json({
            is_success: true,
            item: { id: item.id, title: item.title, status: item.status },
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ is_success: false, message: '서버 오류' });
    }
});
async function canAccessInquiry(user: any, inquiryId: number,company_id?:number): Promise<boolean> {
  
  const u = user as any
  const inq = await Inquiry.findByPk(inquiryId, { attributes: ['id', 'requester_user_id', 'company_id'] });

  if (!inq) return false;
    console.log(company_id);
    console.log(inq.company_id);
  if (u.role === 'ADMIN') return true;
  if (u.role === 'CLIENT' && Number(inq.requester_user_id) === Number(u.id)) return true;
  if (u.role === 'COMPANY' && inq.company_id && Number(inq.company_id) === company_id) return true;

  return false;
}

/** 📜 댓글 목록: GET /inquiry/:inquiryId/comments?page=1&pageSize=20 */
router.get('/:inquiryId/comments', async (req: Request, res: Response) => {

  
  try {
    const bearer = req.headers.authorization;
    const fromHeader = bearer?.startsWith('Bearer ') ? bearer.split(' ')[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);
    if (!token) return res.status(401).json({ is_success: false, message: '인증 토큰이 필요합니다.' });

    const decoded = jwt.verify(token, ACCESS_SECRET) as any; // sub, role 등
    const user = await User.findByPk(decoded.sub);

    const inquiryId = Number(req.params.inquiryId);
    if (!(await canAccessInquiry(user, inquiryId,Number(req.query.company_id)))) {
      return res.status(403).json({ is_success: false, message: '권한 없음' });
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '20'), 10) || 20));
    const offset = (page - 1) * pageSize;

    const { rows, count } = await InquiryComment.findAndCountAll({
      where: { inquiry_id: inquiryId },
      include: [
        { model: User, as: 'author', attributes: ['id', 'name', 'email'] },
      ],
      order: [['createdAt', 'ASC']],
      offset,
      limit: pageSize,
      // paranoid: true (기본) → deletedAt IS NULL 자동 적용
    });

    const total = count;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    res.json({
      is_success: true,
      items: rows.map((c: any) => ({
        id: c.id,
        inquiry_id: c.inquiry_id,
        parent_id: c.parent_id,
        author_user_id: c.author_user_id,
        author_role: c.author_role,
        content: c.content,
        attachments: c.attachments,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        author_name: c.author?.name ?? null,
        author_email: c.author?.email ?? null,
      })),
      page,
      pageSize,
      total,
      totalPages,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ is_success: false, message: '서버 오류' });
  }
});
/** ✍️ 댓글 작성: POST /inquiry/:inquiryId/comments  { content, parent_id? } */
router.post('/:inquiryId/comments', async (req: any, res: Response) => {
  

  const t: Transaction = await sequelize.transaction();
  try {
    console.log(req.body);
    const bearer = req.headers.authorization;
    const fromHeader = bearer?.startsWith('Bearer ') ? bearer.split(' ')[1] : undefined;
    const token = fromHeader || (req.cookies?.access_token as string | undefined);
    if (!token) return res.status(401).json({ is_success: false, message: '인증 토큰이 필요합니다.' });

    const decoded = jwt.verify(token, ACCESS_SECRET) as any; // sub, role 등
    const user = await User.findByPk(decoded.sub);

    const inquiryId = Number(req.params.inquiryId);
    if (!(await canAccessInquiry(user, inquiryId,req.body.companyId))) {
      return res.status(403).json({ is_success: false, message: '권한 없음' });
    }
    const { content, parent_id = null } = req.body ?? {};
    

    // 접근 권한
    if (!(await canAccessInquiry(user, inquiryId,req.body.companyId))) {
      await t.rollback();
      return res.status(403).json({ is_success: false, message: '권한 없음' });
    }

    // parent 체크(있다면 같은 inquiry 소속이어야 함)
    let parentIdToUse: number | null = null;
    if (parent_id) {
      const parent = await InquiryComment.findOne({ where: { id: parent_id, inquiry_id: inquiryId }, transaction: t });
      parentIdToUse = parent ? Number(parent.id) : null; // 부모가 다른 문의면 무시
    }

    const author_role: 'CLIENT'|'COMPANY'|'ADMIN' =
      user?.role === 'ADMIN' ? 'ADMIN'
      : user?.role === 'COMPANY' ? 'COMPANY'
      : 'CLIENT';

    const created = await InquiryComment.create({
      inquiry_id: inquiryId,
      parent_id: parentIdToUse,
      author_user_id: Number(user.id),
      author_role,
      content: String(content).trim(),
      attachments: null,
    }, { transaction: t });

    // (선택) 댓글 작성에 따라 Inquiry 상태 자동 갱신
    // - 회사/관리자 댓글 → ANSWERED
    // - 기관(작성자) 댓글 → OPEN (정책에 맞게 조정)
    const inq = await Inquiry.findByPk(inquiryId, { transaction: t, lock: t.LOCK.UPDATE });
    if (inq) {
      const nextStatus =
        author_role === 'CLIENT' ? 'OPEN' : 'ANSWERED';
      if (inq.status !== nextStatus) {
        await inq.update({ status: nextStatus }, { transaction: t });
      }
    }

    await t.commit();
    res.json({ is_success: true, item: { id: Number(created.id) } });
  } catch (e) {
    await t.rollback();
    console.error(e);
    res.status(500).json({ is_success: false, message: '서버 오류' });
  }
});

/** ✏️ 댓글 수정: PATCH /inquiry/comments/:commentId  { content }  (작성자/관리자) */
router.patch('/inquiry/comments/:commentId', async (req: any, res: Response) => {
  const user = (req as any).user;  if (!user) return;

  try {
    const id = Number(req.params.commentId);
    const { content } = req.body ?? {};
    if (!content || !String(content).trim()) {
      return res.status(400).json({ is_success: false, message: 'content 필수' });
    }

    const comment = await InquiryComment.findByPk(id);
    if (!comment) return res.status(404).json({ is_success: false, message: '댓글 없음' });

    // 접근 권한(댓글 소유자 or ADMIN)
    const isOwner = Number(comment.author_user_id) === Number(user.id);
    const isAdmin = req.user.role === 'ADMIN';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ is_success: false, message: '권한 없음' });
    }

    await comment.update({ content: String(content).trim() });
    res.json({ is_success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ is_success: false, message: '서버 오류' });
  }
});

/** 🗑️ 댓글 삭제(소프트): DELETE /inquiry/comments/:commentId (작성자/관리자) */
router.delete('/inquiry/comments/:commentId', async (req: any, res: Response) => {
  const user = (req as any).user;  if (!user) return;

  try {
    const id = Number(req.params.commentId);
    const comment = await InquiryComment.findByPk(id);
    if (!comment) return res.status(404).json({ is_success: false, message: '댓글 없음' });

    const isOwner = Number(comment.author_user_id) === Number(user.id);
    const isAdmin = req.user.role === 'ADMIN';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ is_success: false, message: '권한 없음' });
    }

    // paranoid:true → destroy()는 deletedAt 세팅
    await comment.destroy();
    res.json({ is_success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ is_success: false, message: '서버 오류' });
  }
});
export default router;