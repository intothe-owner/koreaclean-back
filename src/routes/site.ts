// routes/admin/site.ts
import { Router, Request, Response } from "express";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import multer from "multer";

const { SiteInfo } = require("../../models");
dotenv.config();

const router = Router();
// 파일 존재/사이즈 확인 유틸
async function checkSavedFile(absPath?: string) {
  if (!absPath) return { exists: false };
  try {
    const stat = await fs.promises.stat(absPath);
    return { exists: stat.isFile(), size: stat.size };
  } catch {
    return { exists: false };
  }
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

/** 업로드 폴더 준비 */
const UPLOAD_DIR = path.join(process.cwd(),  "uploads", "site");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/** multer 설정 (이미지 전용, 5MB 제한) */
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `site_icon_${stamp}${ext}`);
  },
});
const upload = multer({
  storage,
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

/** 기존 아이콘 파일 삭제 (서버 로컬에 있을 때만) */
function removeOldIconIfLocal(iconUrl?: string | null) {
  if (!iconUrl) return;
  // 우리 규칙: /uploads/site/파일명 으로 제공
  const prefix = "/uploads/site/";
  if (!iconUrl.startsWith(prefix)) return; // 외부 URL이면 삭제 안 함
  const filename = iconUrl.replace(prefix, "");
  const full = path.join(UPLOAD_DIR, filename);
  fs.promises
    .access(full, fs.constants.F_OK)
    .then(() => fs.promises.unlink(full).catch(() => {}))
    .catch(() => {});
}

// 사이트 정보 저장 (업로드 포함)
router.post(
  "/save",
  upload.single("icon_file"),
  async (req: Request, res: Response) => {

    try {
        // 1) multer가 파일을 받았는지 1차 확인
    const multerInfo = {
      hasFile: !!req.file,
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      sizeFromMulter: req.file?.size,
      savedFilename: req.file?.filename,
      savedRelUrl: req.file ? `/uploads/site/${req.file.filename}` : null,
      savedAbsPath: req.file?.path || (req.file ? path.join(UPLOAD_DIR, req.file.filename) : null),
    };

    // 2) 디스크에 진짜 있는지 2차 확인
    const diskCheck = await checkSavedFile(multerInfo.savedAbsPath || undefined);
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

      // 파일 처리
      let newIconUrl: string | undefined;
      if (req.file) newIconUrl = `/uploads/site/${req.file.filename}`;

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
          meta_tags:metaTags,                                  // 배열 그대로
          terms_text: String(terms_text).trim(),
          privacy_text: String(privacy_text).trim(),

          iconUrl: newIconUrl || null,
          iconKey: req.file ? req.file.filename : null,
        });
      } else {
        if (newIconUrl) removeOldIconIfLocal(site.iconUrl);
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
          meta_tags:metaTags,                                  // 배열 그대로
          terms_text: String(terms_text).trim(),
          privacy_text: String(privacy_text).trim(),

          ...(newIconUrl ? { iconUrl: newIconUrl, iconKey: req.file?.filename || null } : {}),
        });
      }
      console.log(multerInfo);
      return res.json({ is_success: true, message: "저장 성공", item: site, _debug: { multerInfo, diskCheck } });
    } catch (error: any) {
      if (req.file) {
        const full = path.join(UPLOAD_DIR, req.file.filename);
        fs.promises.access(full, fs.constants.F_OK)
          .then(() => fs.promises.unlink(full).catch(() => {}))
          .catch(() => {});
      }
      console.error(error);
      return res.status(400).json({ is_success: false, message: error?.message || "저장 실패" });
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
    } catch {/* ignore */}
  }
  return [];
}

function mapSiteToResponse(site: any) {
  if (!site) return null;
  const s = site.toJSON ? site.toJSON() : site;

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

    icon_url: s.iconUrl ?`http://113.131.151.103:4500${s.iconUrl}`: null,
    icon_key: s.iconKey ?s.iconKey: null,

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
