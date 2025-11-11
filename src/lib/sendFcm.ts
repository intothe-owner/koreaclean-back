import { messaging } from '../fcm';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      require('../service-account.json')   // 경로 맞추세요
    ),
  });
}
export async function sendToToken(token: string) {
  const msg: admin.messaging.Message = {
    token,
    // ✅ 백그라운드 자동 표시 원하면 notification 포함
    notification: {
      title: '테스트 알림',
      body: '서버에서 보낸 메시지입니다.',
    },
    data: {
      click_url: 'https://your-site.com', // 선택
    },
    webpush: {
      // 크롬 기본 클릭 시 열 주소(서비스워커 없어도 열림)
      fcmOptions: { link: 'https://your-site.com' },
      notification: {
        icon: 'https://your-site.com/icon-192.png', // https 권장
        badge: 'https://your-site.com/badge-72.png',
        requireInteraction: true,
      },
      headers: { Urgency: 'high', TTL: '3600' },
    },
    android: { priority: 'high', ttl: 3600_000 },
    apns: { headers: { 'apns-priority': '10' } },
  };

  // 에러면 throw되도록 그대로 반환
  return admin.messaging().send(msg);
}