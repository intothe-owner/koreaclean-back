// src/routes/upload-route.ts
import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function shortId(len = 12) {
  return randomBytes(16).toString("base64url").slice(0, len);
}

/** ===== S3 Client 설정 =====
 * - EC2/ECS/Lambda 등에서 IAM Role을 쓰면 키 없이도 동작합니다.
 * - 로컬/개발환경에서는 아래 .env 값 사용
 */
const s3 = new S3Client({
  region: process.env.AWS_REGION || "ap-northeast-2",
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        }
      : undefined, // (IAM Role 사용 시 undefined)
});

const BUCKET = process.env.AWS_S3_BUCKET!;
const REGION = process.env.AWS_REGION || "ap-northeast-2";
const PUBLIC_BASEURL =
  process.env.AWS_S3_BASEURL || `https://${BUCKET}.s3.${REGION}.amazonaws.com`;
const OBJECT_ACL = (process.env.AWS_S3_ACL || "public-read") as
  | "private"
  | "public-read";

/** 파일을 메모리로 받기 (디스크 저장 X) */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 파일당 20MB
    files: 10,
  },
  // 필요하면 파일 필터 추가:
  // fileFilter: (_req, file, cb) => {
  //   const ok = /^image\/|^application\/pdf$/.test(file.mimetype);
  //   cb(ok ? null : new Error("허용되지 않는 파일 형식입니다."), ok);
  // },
});

/** S3 업로드 공통 함수 */
async function uploadToS3(params: {
  prefix: string; // "request" | "company" | "banner" | "qna" | "edu" | "files"
  file: Express.Multer.File;
}) {
  const { prefix, file } = params;
  const ext = path.extname(file.originalname || "") || "";
  const keyFilename = `${Date.now()}-${shortId()}${ext}`; // 저장용 안전 파일명 (ASCII)
  const objectKey = `${prefix}/${keyFilename}`;

  // 한글/특수문자 포함 원본 파일명
  const originalName = file.originalname || keyFilename;
  // Content-Disposition용 RFC 5987 방식 (ASCII만 사용)
  const cdName = encodeURIComponent(originalName);

  const putParams: PutObjectCommandInput = {
    Bucket: BUCKET,
    Key: objectKey,
    Body: file.buffer,
    ContentType: file.mimetype,
    // ✅ 헤더에는 ASCII만, 한글은 percent-encoding
    ContentDisposition: `inline; filename*=UTF-8''${cdName}`,
    // ❌ 한글이 들어가는 Metadata 제거 (S3 메타데이터는 ASCII만 안전)
    // Metadata: { originalname: file.originalname || "" },
  };

  await s3.send(new PutObjectCommand(putParams));

  // URL 생성: public-read면 정적 URL, private이면 서명 URL 반환
  let url: string;
  if (OBJECT_ACL === "public-read") {
    // objectKey에는 ASCII만 들어가므로 인코딩 없이 사용
    url = `${PUBLIC_BASEURL}/${objectKey}`;
  } else {
    // private인 경우 1시간짜리 서명 URL (원하면 만료시간 조정)
    url = await getSignedUrl(
      s3,
      // ✅ 여기선 GetObjectCommand를 쓰는 게 맞지만,
      // 단순 예시에서는 PutObjectCommand로도 URL 생성 가능(필요 시 변경)
      new PutObjectCommand({ Bucket: BUCKET, Key: objectKey }),
      { expiresIn: 3600 }
    );
  }

  return {
    key: objectKey,
    url,
    name: keyFilename,          // 저장명 (ASCII)
    name_original: originalName, // ✅ 한글 포함 원본명
    size: file.size,
    type: file.mimetype,
  };
}

/** 라우터 생성 */
export const uploadRouter = Router();

/** 공통 핸들러 팩토리: prefix만 바꿔 재사용 */
function makeUploadHandler(
  prefix: "request" | "company" | "banner" | "qna" | "edu" | "files"
) {
  return async (req: any, res: any) => {
    try {
      const files = (req.files as Express.Multer.File[]) || [];
      if (!files.length) return res.json([]);

      const results = await Promise.all(
        files.map((file) => uploadToS3({ prefix, file }))
      );

      // 프런트에서 쓰던 id 필드 포함해서 리턴
      const items = results.map((r) => ({
        id: shortId(),
        url: r.url,
        name: path.basename(r.name),       // 화면 표시용 저장명
        name_original: r.name_original,    // ✅ 한글 포함 원본명
        size: r.size,
        type: r.type,
        key: r.key,                        // 삭제/교체에 사용
      }));

      res.json(items);
    } catch (err: any) {
      console.error(`[${prefix}-upload]`, err);
      res.status(500).json({ message: err?.message || "S3 업로드 실패" });
    }
  };
}

/** 실제 라우팅 (필드명 "files" 유지) */
uploadRouter.post(
  "/request-upload",
  upload.array("files", 10),
  makeUploadHandler("request")
);
uploadRouter.post(
  "/company-upload",
  upload.array("files", 10),
  makeUploadHandler("company")
);
uploadRouter.post(
  "/banner-upload",
  upload.array("files", 10),
  makeUploadHandler("banner")
);
uploadRouter.post(
  "/qna-upload",
  upload.array("files", 10),
  makeUploadHandler("qna")
);
uploadRouter.post(
  "/edu-upload",
  upload.array("files", 10),
  makeUploadHandler("edu")
);
uploadRouter.post(
  "/files",
  upload.array("files", 10),
  makeUploadHandler("files")
);

/** (선택) 단일 삭제 라우트 — 필요하면 사용
 *  body: { key: "request/1234-xxxx.png" }
 */
// uploadRouter.delete("/delete", async (req, res) => {
//   try {
//     const { key } = req.body || {};
//     if (!key) return res.status(400).json({ message: "key is required" });
//     await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
//     res.json({ ok: true });
//   } catch (err: any) {
//     console.error("[s3-delete]", err);
//     res.status(500).json({ message: err?.message || "S3 삭제 실패" });
//   }
// });
