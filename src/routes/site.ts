// routes/admin/site.ts
import { Router, Request, Response } from "express";
import dotenv from "dotenv";
import path from "path";
import multer from "multer";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const { SiteInfo } = require("../../models");
dotenv.config();

const router = Router();

/**
 * 필요 환경변수(.env)
 * AWS_REGION=ap-northeast-2
 * AWS_S3_BUCKET=your-bucket-name
 * # 선택(있으면 사용, 없으면 s3 기본 URL 사용)
 * CDN_BASE_URL=https://your-cloudfront-domain  또는
 * S3_PUBLIC_BASE_URL=https://your-bucket.s3.ap-northeast-2.amazonaws.com
 */
const S3_REGION = process.env.AWS_REGION || "ap-northeast-2";
const S3_BUCKET = process.env.AWS_S3_BUCKET || "";
const ASSET_BASE_URL =`https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`

if (!S3_BUCKET) {
  console.warn(
    "[site.ts] 경고: AWS_S3_BUCKET 환경변수가 설정되지 않았습니다."
  );
}

/** meta_tags 파싱: JSON 문자열/콤마 구분/복수 필드 모두 허용 */
function parseMetaTags(input: unknown): string[] {
  if (Array.isArray(input)) {
    // ["a","b"] 또는 ["a, b"] 같은 케이스 -> 낱개로 쪼개고 트림
    return input
      .flatMap((v) => String(v).split(/[,\s]+/))
      .map((s) => s.trim().replace(/^#/, ""))
      .filter(Boolean)
      .slice(0, 10); // 최대 10개 같은 제한을 두고 싶을 때
  }

  if (typeof input === "string") {
    const v = input.trim();
    if (!v) return [];
    // JSON 배열 형태면 우선적으로 파싱
    if ((v.startsWith("[") && v.endsWith("]")) || (v.startsWith('"') && v.endsWith('"'))) {
      try {
        const arr = JSON.parse(v);
        if (Array.isArray(arr)) {
          return arr
            .map((s) => String(s).trim().replace(/^#/, ""))
            .filter(Boolean)
            .slice(0, 10);
        }
      } catch {
        /* JSON 아님 → 아래 로직 처리 */
      }
    }
    // 콤마/스페이스/개행 기준 분리
    return v
      .split(/[,\s]+/)
      .map((s) => s.trim().replace(/^#/, ""))
      .filter(Boolean)
      .slice(0, 10);
  }

  return [];
}

/** multer 설정 (메모리 저장, 5MB 제한) */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = /image\/(png|jpeg|jpg|webp|gif|svg\+xml)/i.test(file.mimetype);
    if (!ok) return cb(new Error("이미지 파일만 업로드할 수 있습니다."));
    cb(null, true);
  },
});

/** 문자열 → boolean */
function toBool(v: any) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "1" || v.toLowerCase() === "true";
  return false;
}

/** S3 클라이언트 */
const s3 = new S3Client({ region: S3_REGION });

/** 기존 아이콘 S3에서 삭제 */
async function removeOldIconFromS3(iconKey?: string | null) {
  if (!iconKey || !S3_BUCKET) return;
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: iconKey,
      })
    );
  } catch (e) {
    console.warn("[site.ts] 기존 아이콘 삭제 실패(무시):", e);
  }
}

/** S3에 파일 업로드 후 { key, url } 반환 */
async function uploadIconToS3(file: Express.Multer.File) {
  if (!S3_BUCKET) {
    throw new Error("S3 버킷이 설정되지 않았습니다(AWS_S3_BUCKET).");
  }

  const ext = path.extname(file.originalname) || ".png";
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const key = `site/site_icon_${stamp}${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      // ❗ ACL 미사용 (AccessControlListNotSupported 오류 방지)
    })
  );

  // 공개 URL 생성 (CDN_BASE_URL 또는 S3 기본 URL)
  const base =
    ASSET_BASE_URL ||
    `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`;

  const url = `${base.replace(/\/$/, "")}/${key}`;
  return { key, url };
}

// 사이트 정보 저장 (업로드 포함)
router.post(
  "/save",
  upload.single("icon_file"),
  async (req: Request, res: Response) => {
    try {
      // multer info (디버그용)
      const multerInfo = {
        hasFile: !!req.file,
        originalname: req.file?.originalname,
        mimetype: req.file?.mimetype,
        sizeFromMulter: req.file?.size,
      };

      const {
        site_name = "",
        post_code = "",
        address = "",
        address_detail = "",
        biz_no = "",
        ceo_name = "",
        tel = "",
        fax = "",
        email = "",
        email_public = "1",
        site_description = "",
        terms_text = "",
        privacy_text = "",
      } = req.body as Record<string, any>;
      console.log(req.body);

      // 🔽 meta_tags robust parsing
      const metaTags = parseMetaTags((req.body as any).meta_tags);

      // 파일 처리 (S3 업로드)
      let newIconUrl: string | undefined;
      let newIconKey: string | undefined;

      if (req.file) {
        const uploaded = await uploadIconToS3(req.file);
        newIconUrl = uploaded.url;
        newIconKey = uploaded.key;
      }

      // upsert 유사
      let site = await SiteInfo.findOne();
      if (!site) {
        site = await SiteInfo.create({
          siteName: String(site_name).trim(),
          postCode: String(post_code).trim(),
          address: String(address).trim(),
          addressDetail: String(address_detail).trim(),
          bizNo: String(biz_no).trim(),
          ceoName: String(ceo_name).trim(),
          tel: String(tel).trim(),
          fax: String(fax).trim(),
          email: String(email).trim().toLowerCase(),
          emailPublic: toBool(email_public),

          // ⬇️ 추가 필드 (모델 필드명과 일치시켜 주세요)
          site_description: String(site_description).trim(),
          meta_tags: metaTags, // 배열 그대로
          terms_text: String(terms_text).trim(),
          privacy_text: String(privacy_text).trim(),

          iconUrl: newIconUrl || null,
          iconKey: newIconKey || null,
        });
      } else {
        // 기존 S3 아이콘 삭제
        if (newIconKey) {
          await removeOldIconFromS3(site.iconKey);
        }

        await site.update({
          siteName: String(site_name).trim(),
          postCode: String(post_code).trim(),
          address: String(address).trim(),
          addressDetail: String(address_detail).trim(),
          bizNo: String(biz_no).trim(),
          ceoName: String(ceo_name).trim(),
          tel: String(tel).trim(),
          fax: String(fax).trim(),
          email: String(email).trim().toLowerCase(),
          emailPublic: toBool(email_public),

          site_description: String(site_description).trim(),
          meta_tags: metaTags, // 배열 그대로
          terms_text: String(terms_text).trim(),
          privacy_text: String(privacy_text).trim(),

          ...(newIconUrl
            ? { iconUrl: newIconUrl, iconKey: newIconKey || null }
            : {}),
        });
      }

      console.log(multerInfo);
      return res.json({
        is_success: true,
        message: "저장 성공",
        item: site,
        _debug: { multerInfo },
      });
    } catch (error: any) {
      console.error(error);
      return res
        .status(400)
        .json({ is_success: false, message: error?.message || "저장 실패" });
    }
  }
);

function pickString(s: any, camel: string, snake: string, fallback = ""): string {
  if (!s) return fallback;
  if (typeof s[camel] === "string") return s[camel];
  if (typeof s[snake] === "string") return s[snake];
  return fallback;
}

function pickArrayOrJsonString<T = string>(s: any, camel: string, snake: string): T[] {
  const raw = s?.[camel] ?? s?.[snake];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as T[];
    } catch {
      /* ignore */
    }
  }
  return [];
}

function mapSiteToResponse(site: any) {
  if (!site) return null;
  const s = site.toJSON ? site.toJSON() : site;

  const iconUrlRaw = s.iconUrl ?? s.icon_url ?? null;
  const iconUrl =
    iconUrlRaw && typeof iconUrlRaw === "string"
      ? iconUrlRaw.startsWith("http")
        ? iconUrlRaw
        : `http://3.36.49.217${iconUrlRaw}` // 이전 로컬 경로와의 호환용
      : null;

  return {
    id: s.id,
    site_name: s.siteName ?? s.site_name ?? "",
    post_code: s.postCode ?? s.post_code ?? "",
    address: s.address ?? "",
    address_detail: s.addressDetail ?? s.address_detail ?? "",
    biz_no: s.bizNo ?? s.biz_no ?? "",
    ceo_name: s.ceoName ?? s.ceo_name ?? "",
    tel: s.tel ?? "",
    fax: s.fax ?? "",
    email: s.email ?? "",
    email_public: Boolean(s.emailPublic ?? s.email_public ?? true),

    // ✅ 양쪽 키 모두 지원
    site_description: pickString(s, "siteDescription", "site_description", ""),
    meta_tags: pickArrayOrJsonString<string>(s, "metaTags", "meta_tags"),
    terms_text: pickString(s, "termsText", "terms_text", ""),
    privacy_text: pickString(s, "privacyText", "privacy_text", ""),

    icon_url: iconUrl,
    icon_key: s.iconKey ?? s.icon_key ?? null,

    created_at: s.createdAt ?? s.created_at ?? null,
    updated_at: s.updatedAt ?? s.updated_at ?? null,
  };
}

/** (관리자) 사이트 정보 단건 조회 */
router.get("/detail", async (req: Request, res: Response) => {
  try {
    const site = await SiteInfo.findOne();
    if (!site) {
      // 초기 상태: 레코드 없음 → 프런트 폼 채우기 위한 빈 값 반환
      return res.json({
        is_success: true,
        item: mapSiteToResponse({
          id: null,
          siteName: "",
          postCode: "",
          address: "",
          addressDetail: "",
          bizNo: "",
          ceoName: "",
          tel: "",
          fax: "",
          email: "",
          emailPublic: true,
          site_description: "",
          meta_tags: [],
          terms_text: "",
          privacy_text: "",
          iconUrl: null,
          iconKey: null,
          createdAt: null,
          updatedAt: null,
        }),
      });
    }

    return res.json({ is_success: true, item: mapSiteToResponse(site) });
  } catch (error: any) {
    console.error(error);
    return res
      .status(400)
      .json({ is_success: false, message: error?.message || "조회 실패" });
  }
});

/** (공개용) 사이트 공개 정보 조회 — 필요 시 사용 */
router.get("/public", async (req: Request, res: Response) => {
  try {
    const site = await SiteInfo.findOne({
      attributes: [
        "siteName",
        "siteDescription",
        "metaTags",
        "iconUrl",
        "emailPublic",
        "email",
        "tel",
        "fax",
      ],
    });
    const mapped = mapSiteToResponse(site);
    if (!mapped) {
      return res.json({
        is_success: true,
        item: {
          site_name: "",
          site_description: "",
          meta_tags: [],
          icon_url: null,
          tel: "",
          fax: "",
          email: "",
          email_public: true,
        },
      });
    }
    // 공개 필드만 엄선
    const item = {
      site_name: mapped.site_name,
      site_description: mapped.site_description,
      meta_tags: mapped.meta_tags,
      icon_url: mapped.icon_url,
      tel: mapped.tel,
      fax: mapped.fax,
      email: mapped.email_public ? mapped.email : "", // 비공개면 마스킹/공백 처리
      email_public: mapped.email_public,
    };
    return res.json({ is_success: true, item });
  } catch (error: any) {
    console.error(error);
    return res
      .status(400)
      .json({ is_success: false, message: error?.message || "조회 실패" });
  }
});

export default router;
