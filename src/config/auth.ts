// src/config/auth.ts
export const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
export const ACCESS_TTL_SEC = Number(process.env.ACCESS_TTL_SEC || 3600);
export const REMEMBER_TTL_SEC = Number(process.env.REMEMBER_TTL_SEC || 1209600);
