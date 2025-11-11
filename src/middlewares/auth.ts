// middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
const { User } = require("../../models");
export interface AuthRequest extends Request {
  auth?: { sub: number | string; role?: string }; 
}
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "dev-access";
export function auth(required = true) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bearer = String(req.headers.authorization ?? "");
      const fromHeader = bearer.startsWith("Bearer ") ? bearer.slice(7) : undefined;
      const token = fromHeader || (req.cookies?.access_token as string | undefined);
      console.log(token);
      if (!token) {
        if (required) return res.status(401).json({ is_success: false, message: "인증 토큰이 필요합니다." });
        (req as any).user = null;
        return next();
      }

      const decoded = jwt.verify(token, ACCESS_SECRET) as any;
      const user = await User.findByPk(decoded.sub);
      if (!user) return res.status(401).json({ is_success: false, message: "유효하지 않은 토큰입니다." });

      (req as any).user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        provider: user.provider ?? "local",
        is_use: user.is_use,
      };
      return next();
    } catch (e) {
      console.error("[auth] error:", e);
      return res.status(401).json({ is_success: false, message: "인증 실패" });
    }
  };
}
export function attachUserFromAuthHeader(req: Request, _res: Response, next: NextFunction) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return next();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'devsecret') as any;
    (req as any).user = { id: payload.id, email: payload.email, role: payload.role };
  } catch (e) {
    // 토큰이 유효하지 않아도 다음으로— requireAuth에서 401 처리함
  }
  next();
}