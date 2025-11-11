import "express";

declare global {
  namespace Express {
    interface UserPayload {
      id: number;
      email: string;
      name?: string;
      level?: number;
      mobile?:string;
      role?: string;        // ← ensureAuth에서 넣는 값들도 포함
      is_confirm?: boolean; // ← ensureAuth에서 넣는 값들도 포함
    }

    interface Request {
      user?: UserPayload;
    }
  }
}
