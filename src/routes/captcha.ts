// routes/edu.ts  (교육 공지 + 캡차 라우터)
import { Router, Request, Response } from "express";
import dotenv from "dotenv";
import svgCaptcha from "svg-captcha";
import crypto from "crypto";

dotenv.config();

const router = Router();

/** 캡차 저장소 (id -> { text, expires })  
 *  실제 서비스면 Redis/DB를 쓰는 게 좋고,
 *  여기선 간단히 메모리 Map 사용.
 */
type CaptchaItem = { text: string; expires: number };
const captchaStore = new Map<string, CaptchaItem>();

// 캡차 생성 함수
function createCaptcha() {
  const captcha = svgCaptcha.create({
    size: 6,              // 글자 수
    noise: 4,             // 지저분한 선 갯수
    color: true,
    width: 150,
    height: 60,
    background: "#e5e5e5",
    ignoreChars: "0Oo1Il", // 헷갈리는 문자 제거
  });

  const id = crypto.randomUUID();
  captchaStore.set(id, {
    text: captcha.text.toLowerCase(),
    expires: Date.now() + 1000 * 60 * 5, // 5분 유효
  });

  // 브라우저에서 바로 쓸 수 있게 data URL 로 변환
  const base64 = Buffer.from(captcha.data).toString("base64");
  const image = `data:image/svg+xml;base64,${base64}`;

  return { id, image };
}

/**
 * GET /captcha
 * 새 캡차 발급
 * 응답: { id, image }
 */
router.get("/captcha", (req: Request, res: Response) => {
  const captcha = svgCaptcha.create({
    size: 6,
    noise: 4,
    color: true,
    background: "#e5e5e5",
    ignoreChars: "0Oo1Il",
    // 숫자만 쓰고 싶으면:
    // charPreset: "0123456789"
  });

  const id = crypto.randomUUID();
  captchaStore.set(id, {
    text: captcha.text.toLowerCase(),
    expires: Date.now() + 1000 * 60 * 5,
  });

  const base64 = Buffer.from(captcha.data).toString("base64");
  const image = `data:image/svg+xml;base64,${base64}`;

  // ⬇️ text 도 함께 보냄 (음성용)
  res.json({
    id,
    image,
    text: captcha.text,  // 대문자/원본 그대로
  });
});

/**
 * POST /captcha/verify
 * body: { id: string, answer: string }
 * 응답: { success: boolean, message?: string }
 */
router.post("/verify", (req: Request, res: Response) => {
  const { id, answer } = req.body as { id?: string; answer?: string };
  if (!id || !answer) {
    return res
      .status(400)
      .json({ success: false, message: "잘못된 요청입니다." });
  }

  const item = captchaStore.get(id);
  if (!item) {
    return res.json({
      success: false,
      message: "캡차가 만료되었거나 없습니다. 새로고침 해주세요.",
    });
  }

  if (item.expires < Date.now()) {
    captchaStore.delete(id);
    return res.json({
      success: false,
      message: "캡차가 만료되었습니다. 새로고침 해주세요.",
    });
  }

  const userText = String(answer).toLowerCase().trim();
  if (userText === item.text) {
    // 한 번 맞으면 제거
    captchaStore.delete(id);
    return res.json({ success: true });
  }

  return res.json({
    success: false,
    message: "자동입력방지 문자가 일치하지 않습니다.",
  });
});

export default router;
