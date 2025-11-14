// routes/admin/site.ts  (Notice 라우터)
import { Router, Request, Response } from "express";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import { Op } from "sequelize";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

dotenv.config();

const { Notice } = require("../../models");

const router = Router();

/* ------------------ S3 설정 ------------------ */
/**
 * .env 예시
 * AWS_REGION=ap-northeast-2
 * AWS_S3_BUCKET=your-bucket-name
 * CDN_BASE_URL=https://xxxx.cloudfront.net          # 선택
 * # 또는
 * # S3_PUBLIC_BASE_URL=https://your-bucket.s3.ap-northeast-2.amazonaws.com
 */
const S3_REGION = process.env.AWS_REGION || "ap-northeast-2";
const S3_BUCKET = process.env.AWS_S3_BUCKET || "";
const ASSET_BASE_URL =`https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`

if (!S3_BUCKET) {
  console.warn("[notice.ts] 경고: AWS_S3_BUCKET 환경변수가 설정되지 않았습니다.");
}

const s3 = new S3Client({ region: S3_REGION });

/* ------------------ 업로드 설정 (multer: 메모리) ------------------ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB 제한 (원하면 조정)
  // 필요하면 fileFilter에 허용 확장자 제한 추가 가능
});

/** S3에 공지 첨부파일 업로드 */
async function uploadNoticeFileToS3(file: Express.Multer.File) {
  if (!S3_BUCKET) {
    throw new Error("S3 버킷이 설정되지 않았습니다(AWS_S3_BUCKET).");
  }

  const ext = path.extname(file.originalname) || "";
  const base = path
    .basename(file.originalname, ext)
    .replace(/[^\w.-]/g, "_");
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const key = `notice/${stamp}_${base}${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      // ACL 설정은 하지 않음 (AccessControlListNotSupported 오류 방지)
    })
  );

  const baseUrl =
    ASSET_BASE_URL ||
    `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`;

  const url = `${baseUrl.replace(/\/$/, "")}/${key}`;
  return { key, url };
}

/** S3 객체 삭제 */
async function deleteS3Object(key?: string | null) {
  if (!key || !S3_BUCKET) return;
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      })
    );
  } catch (e) {
    console.warn("[notice.ts] S3 첨부 삭제 실패(무시):", e);
  }
}

/* ------------------ 공지 저장 ------------------
   FormData 필드:
   - id?                : number (수정 시)
   - title              : string
   - content            : string (HTML/텍스트)
   - priority           : 'EMERGENCY' | 'IMPORTANT' | 'NORMAL'
   - is_pinned          : 'Y' | 'N'
   - attachments_meta?  : stringified JSON (기존 첨부 유지용)
   - files[]            : 업로드 파일들
------------------------------------------------- */
router.post(
  "/save",
  upload.array("files", 10),
  async (req: Request, res: Response) => {
    try {
      const {
        id,
        title,
        content,
        priority = "NORMAL",
        is_pinned = "N",
        attachments_meta,
      } = req.body as {
        id?: string;
        title: string;
        content: string;
        priority?: "EMERGENCY" | "IMPORTANT" | "NORMAL";
        is_pinned?: "Y" | "N";
        attachments_meta?: string;
      };

      if (!title || !content) {
        return res
          .status(400)
          .json({ is_success: false, message: "title, content는 필수입니다." });
      }

      // 기존 첨부(수정 시 유지) 파싱
      let existing: any[] = [];
      if (attachments_meta) {
        try {
          const parsed = JSON.parse(attachments_meta);
          if (Array.isArray(parsed)) existing = parsed;
        } catch {
          // ignore 잘못된 JSON
        }
      }

      // 새 업로드 파일들을 S3에 올리고 첨부 메타로 변환
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const uploaded = await Promise.all(
        files.map(async (f) => {
          const { key, url } = await uploadNoticeFileToS3(f);
          return {
            name: f.originalname,
            url,         // S3 또는 CDN URL
            key,         // S3 Object Key (삭제용)
            size: f.size,
            mime: f.mimetype,
          };
        })
      );

      const attachments = [...existing, ...uploaded];

      // 생성/수정 분기
      if (id) {
        const row = await Notice.findByPk(id);
        if (!row)
          return res
            .status(404)
            .json({ is_success: false, message: "해당 공지를 찾을 수 없습니다." });

        await row.update({
          title,
          content,
          priority,
          is_pinned: is_pinned === "Y",
          attachments,
        });

        return res.json({ is_success: true, id: row.id });
      } else {
        const row = await Notice.create({
          title,
          content,
          priority,
          is_pinned: is_pinned === "Y",
          attachments,
          views: 0,
        });
        return res.json({ is_success: true, id: row.id });
      }
    } catch (err: any) {
      console.error(err);
      return res
        .status(500)
        .json({ is_success: false, message: err?.message || "서버 오류" });
    }
  }
);

/* ------------------ 공지 목록 ------------------
   Query:
   - q?          : string (제목/내용 LIKE)
   - priority?   : 'EMERGENCY' | 'IMPORTANT' | 'NORMAL'
   - page?       : number (default 1)
   - page_size?  : number (default 10)
   - order_by?   : 'createdAt' | 'title' | 'views' | 'priority' | 'is_pinned' (default 'createdAt')
   - order_dir?  : 'ASC' | 'DESC' (default 'DESC')
------------------------------------------------- */
router.get("/list", async (req: Request, res: Response) => {
  try {
    const {
      q = "",
      priority,
      page = "1",
      page_size = "10",
      order_by = "createdAt",
      order_dir = "DESC",
    } = req.query as Record<string, string>;

    const pageNum = Math.max(parseInt(page || "1", 10) || 1, 1);
    const pageSizeNum = Math.min(
      Math.max(parseInt(page_size || "10", 10) || 10, 1),
      100
    );

    // where 조건
    const where: any = {};
    if (priority && ["EMERGENCY", "IMPORTANT", "NORMAL"].includes(priority)) {
      where.priority = priority;
    }
    if (q) {
      where[Op.or] = [
        { title: { [Op.like]: `%${q}%` } },
        { content: { [Op.like]: `%${q}%` } },
      ];
    }

    // 정렬
    const ALLOW_ORDER = new Set([
      "createdAt",
      "title",
      "views",
      "priority",
      "is_pinned",
    ]);
    const orderBy = ALLOW_ORDER.has(order_by) ? order_by : "createdAt";
    const orderDir = order_dir?.toUpperCase() === "ASC" ? "ASC" : "DESC";

    const { rows, count } = await Notice.findAndCountAll({
      where,
      order: [
        ["is_pinned", "DESC"],
        [orderBy, orderDir],
      ],
      offset: (pageNum - 1) * pageSizeNum,
      limit: pageSizeNum,
      attributes: [
        "id",
        "title",
        "priority",
        "is_pinned",
        "views",
        "createdAt",
        "updatedAt",
      ],
    });

    return res.json({
      is_success: true,
      items: rows,
      total: count,
      page: pageNum,
      page_size: pageSizeNum,
    });
  } catch (err: any) {
    console.error(err);
    return res
      .status(500)
      .json({ is_success: false, message: err?.message || "서버 오류" });
  }
});

router.post("/delete", async (req: Request, res: Response) => {
  try {
    const id = (req.query.id as string) || (req.body?.id as string);
    if (!id)
      return res
        .status(400)
        .json({ is_success: false, message: "id가 필요합니다." });

    const row = await Notice.findByPk(id);
    if (!row)
      return res
        .status(404)
        .json({ is_success: false, message: "해당 공지를 찾을 수 없습니다." });

    // S3 첨부 삭제 (옵션: 환경변수로 on/off)
    if (
      process.env.REMOVE_FILES_ON_DELETE === "true" &&
      Array.isArray(row.attachments)
    ) {
      const atts: any[] = row.attachments;
      await Promise.all(
        atts.map(async (a) => {
          const key = a?.key || a?.s3Key || a?.s3_key;
          // 예전 로컬 첨부에는 key가 없을 수 있으니 있을 때만 삭제
          if (key) {
            await deleteS3Object(key);
          }
        })
      );
    }

    await row.destroy(); // paranoid: true 이면 soft delete
    return res.json({ is_success: true });
  } catch (err: any) {
    console.error(err);
    return res
      .status(500)
      .json({ is_success: false, message: err?.message || "서버 오류" });
  }
});

router.get("/detail", async (req: Request, res: Response) => {
  try {
    const id = req.query.id as string;
    const incView = req.query.inc_view === "1";

    if (!id) {
      return res
        .status(400)
        .json({ is_success: false, message: "id가 필요합니다." });
    }

    const row = await Notice.findByPk(id, {
      attributes: [
        "id",
        "title",
        "content",
        "priority",
        "is_pinned",
        "attachments",
        "views",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ],
    });

    if (!row) {
      return res
        .status(404)
        .json({ is_success: false, message: "해당 공지를 찾을 수 없습니다." });
    }

    // 조회수 증가 옵션
    if (incView) {
      await row.increment("views", { by: 1 });
      await row.reload();
    }

    return res.json({
      is_success: true,
      item: row,
    });
  } catch (err: any) {
    console.error(err);
    return res
      .status(500)
      .json({ is_success: false, message: err?.message || "서버 오류" });
  }
});

export default router;
