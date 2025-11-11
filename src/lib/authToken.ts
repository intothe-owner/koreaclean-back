import { Request } from 'express';

export function extractAccessToken(req: Request): string | undefined {
  // 1) Authorization: Bearer xxx
  const bearer = req.headers.authorization;
  if (bearer && bearer.startsWith('Bearer ')) {
    const token = bearer.slice(7).trim();
    if (token) return token;
  }
  // 2) 헤더 커스텀(선택)
  const headerToken = (req.headers['x-access-token'] as string | undefined)?.trim();
  if (headerToken) return headerToken;

  // 3) Cookie (cookie-parser 필수)
  const cookieToken = (req.cookies?.access_token as string | undefined)?.trim();
  if (cookieToken) return cookieToken;

  return undefined;
}