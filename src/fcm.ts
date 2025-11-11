// fcm.ts
import admin from 'firebase-admin';

// 서비스 계정 키 JSON 파일 경로 또는 환경변수 사용
admin.initializeApp({
  credential: admin.credential.cert(require('./service-account.json')),
}); 

export const messaging = admin.messaging();
