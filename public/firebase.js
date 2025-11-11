// public/firebase.js (또는 프론트엔드 코드)
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// 토큰 발급
export async function requestFcmToken() {
  const permission = await Notification.requestPermission();
  console.log('aaa');
  if (permission !== "granted") return null;
  
  const token = await getToken(messaging, {
    vapidKey: process.env.VAPID_KEY,
    serviceWorkerRegistration: await navigator.serviceWorker.register("/firebase-messaging-sw.js"),
  });
  return token;
}

// 앱 실행 중 메시지 수신
onMessage(messaging, (payload) => {
  console.log("Foreground message:", payload);
});
