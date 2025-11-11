// src/routes/upload-route.ts (수정 버전)
import path from "node:path";
import fs from "node:fs";
import { Router } from "express";
import multer from "multer";
import { randomBytes } from "node:crypto";

function shortId(len = 12) {
  return randomBytes(16).toString("base64url").slice(0, len);
}

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const REQUEST_UPLOAD_DIR=path.join(process.cwd(), "uploads/request");
const COMPANY_UPLOAD_DIR=path.join(process.cwd(), "uploads/company");
const BANNER_UPLOAD_DIR=path.join(process.cwd(), "uploads/banner");
const QNA_UPLOAD_DIR=path.join(process.cwd(), "uploads/qna");
const requestStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    console.log('body',_req);
    cb(null, REQUEST_UPLOAD_DIR)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const safe = `${Date.now()}-${shortId()}${ext}`;
    cb(null, safe);
  },
});
const requestUpload = multer({ storage:requestStorage });
const companyStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    console.log('body',_req);
    cb(null, COMPANY_UPLOAD_DIR)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const safe = `${Date.now()}-${shortId()}${ext}`;
    cb(null, safe);
  },
});
const companyUpload = multer({ storage:companyStorage });
const bannerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    console.log('body',_req);
    cb(null, BANNER_UPLOAD_DIR)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const safe = `${Date.now()}-${shortId()}${ext}`;
    cb(null, safe);
  },
});
const bannerUpload = multer({ storage:bannerStorage });
const qnaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    console.log('body',_req);
    cb(null, QNA_UPLOAD_DIR)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const safe = `${Date.now()}-${shortId()}${ext}`;
    cb(null, safe);
  },
});
const qnaUpload = multer({ storage:qnaStorage });

export const uploadRouter = Router();

uploadRouter.post("/request-upload", requestUpload.array("files", 10), (req, res) => {
  const items = (req.files as Express.Multer.File[]).map((f) => {
    const filename = path.basename(f.filename); // 저장된 파일명(ASCII)
    const url = `${process.env.BASEURL}/uploads/request/${encodeURIComponent(filename)}`; // ✅ URL 인코딩
    return {
      id: shortId(),
      url,
      name: filename,                // 표시용으로 저장명도 함께 전달
      name_original: f.originalname, // ✅ 한글 원본명도 전달
      size: f.size,
      type: f.mimetype,
    };
  });
  res.json(items);
});
uploadRouter.post("/company-upload", companyUpload.array("files", 10), (req, res) => {
  const items = (req.files as Express.Multer.File[]).map((f) => {
    const filename = path.basename(f.filename); // 저장된 파일명(ASCII)
    const url = `${process.env.BASEURL}/uploads/company/${encodeURIComponent(filename)}`; // ✅ URL 인코딩
    return {
      id: shortId(),
      url,
      name: filename,                // 표시용으로 저장명도 함께 전달
      name_original: f.originalname, // ✅ 한글 원본명도 전달
      size: f.size,
      type: f.mimetype,
    };
  });
  res.json(items);
});
uploadRouter.post("/banner-upload", bannerUpload.array("files", 10), (req, res) => {
  const items = (req.files as Express.Multer.File[]).map((f) => {
    const filename = path.basename(f.filename); // 저장된 파일명(ASCII)
    const url = `${process.env.BASEURL}/uploads/banner/${encodeURIComponent(filename)}`; // ✅ URL 인코딩
    return {
      id: shortId(),
      url,
      name: filename,                // 표시용으로 저장명도 함께 전달
      name_original: f.originalname, // ✅ 한글 원본명도 전달
      size: f.size,
      type: f.mimetype,
    };
  });
  res.json(items);
});
uploadRouter.post("/qna-upload", qnaUpload.array("files", 10), (req, res) => {
  const items = (req.files as Express.Multer.File[]).map((f) => {
    const filename = path.basename(f.filename); // 저장된 파일명(ASCII)
    const url = `${process.env.BASEURL}/uploads/qna/${encodeURIComponent(filename)}`; // ✅ URL 인코딩
    return {
      id: shortId(),
      url,
      name: filename,                // 표시용으로 저장명도 함께 전달
      name_original: f.originalname, // ✅ 한글 원본명도 전달
      size: f.size,
      type: f.mimetype,
    };
  });
  res.json(items);
});

// (서버 설정) 정적 제공은 그대로 가능
// app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
