import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import morgan from 'morgan';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

// 기존 라우터들
import users from './routes/users';
import auth from './routes/auth';
import request from './routes/request';
import inquiry from './routes/inquiry';
import company from './routes/company';
import senior from './routes/senior';
import geocode from './routes/geocode';
import site from './routes/site';
import banners from './routes/banners';
import pricing from './routes/pricing';
import notice from './routes/notice';
import faq from './routes/faq';
import qna from './routes/qna';
import reviews from './routes/reviews';
import createChatRouter from './routes/chat';
import apiRouter from './routes/api';
import countRouter from './routes/count';
import visitRouter from './routes/visit';
import {uploadRouter} from './routes/upload-route';
import forgotRouter from './routes/authForgot'; // 위에 만든 파일 경로
import eduRouter from './routes/edu'; // 위에 만든 파일 경로
import captchaRouter from './routes/captcha';


// 인증 미들웨어(Authorization 헤더 → req.user 세팅)
import { attachUserFromAuthHeader } from './middlewares/auth';

// 채팅 서비스 (소켓 이벤트에서 사용)
import { ensureMember, sendMessage, markRead } from './service/chat.service';

// models(CJS export)
const db = require('../models'); 

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4500);

// ===== CORS =====
const corsOptions: cors.CorsOptions = { 
  origin: [
    'http://localhost:3000',
    'http://113.131.151.103:3000',
    'http://113.131.151.103:8088',
    'http://localhost:8088',
    'https://dapi.kakao.com',
    'http://54.180.232.178',
    'http://koreacleancoop.kr',
    'http://www.koreacleancoop.kr',
  ],
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
};
app.use(cors(corsOptions));

// ===== 공통 미들웨어 =====
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true}));
app.use(morgan('dev')); // 요청 로그
//서버시작과 동시에 db 동기화 하기
db.sequelize.sync({ force:false})
    .then(()=>{
        console.log('데이터베이스 연결 성공') 
    })
    .catch((err:any)=>{
        console.error(err) 
    });
// (프록시 앞 단이면)
// app.set('trust proxy', 1);

// ===== 정적 경로 =====
app.use('/uploads', express.static('uploads'));

// ===== 라우터 =====
app.use('/users', users);
app.use('/auth', auth);
app.use('/company', company);
app.use('/request', request);
app.use('/inquiry', inquiry);
app.use('/senior', senior);
app.use('/geocode', geocode);
app.use('/site', site);
app.use('/banners', banners);
app.use('/pricing', pricing);
app.use('/notice', notice);
app.use('/faq', faq);
app.use('/qna', qna);
app.use('/reviews', reviews);
app.use('/upload', uploadRouter);
app.use('/api', apiRouter);
app.use('/find', forgotRouter); 
app.use('/count', countRouter); 
app.use('/visit', visitRouter); 
app.use('/edu', eduRouter); 
app.use('/captcha',captchaRouter);

// 인증 파서 → /chat 라우터 전에
app.use(attachUserFromAuthHeader);

// (디버그: /chat 요청 헤더/유저 확인)
// app.use('/chat', (req, _res, next) => {
//   console.log('[CHAT] headers:', req.headers);
//   console.log('[CHAT] cookies:', req.cookies);
//   console.log('[CHAT] user:', (req as any).user);
//   next();
// });



// ===== 헬스체크 =====
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

// ===== 에러 핸들러(최후) =====
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled Error:', err);
  res.status(err?.status || 500).json({ message: err?.message || 'Internal Server Error' });
});
// ====== HTTP + Socket.IO 서버 시작 ======
const server = http.createServer(app);

const io = new Server(server, {
  path: "/socket.io",
  perMessageDeflate: false,
  pingTimeout: 25000,
  pingInterval: 20000,
  cors: {
    origin: (origin, cb) => cb(null, true),
    credentials: true,
    methods: ["GET","POST","PUT","DELETE","PATCH","OPTIONS"],
    allowedHeaders: ["authorization","content-type"],
  },
});
const chatSocket = io.of('/chat');
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev-access';

function extractTokenFromSocket(socket: any): string | undefined {
  const fromAuth = socket.handshake?.auth?.token as string | undefined;
  const authHeader = socket.handshake?.headers?.authorization as string | undefined;
  const fromHeader = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
  const cookieStr = socket.handshake?.headers?.cookie as string | undefined;
  const fromCookie = cookieStr?.split(';')?.map(s=>s.trim())
    ?.find((s)=>s.startsWith('access_token='))?.split('=')[1];
  return fromAuth || fromHeader || fromCookie;
}

function tryVerify(token?: string) {
  if (!token) return null;
  try { return jwt.verify(token, ACCESS_SECRET) as any; } catch { return null; }
}

// 네임스페이스 레벨 미들웨어로 JWT 검증
// chatSocket.use((socket, next) => {
//   try {
//     const token = extractTokenFromSocket(socket);
//     if (!token) return next(new Error('Unauthorized: token not found'));
//     const decoded = jwt.verify(token, ACCESS_SECRET) as any;
//     // 이후 이벤트 핸들러에서 쓸 수 있게 저장
//     socket.data.user = {
//       id: decoded.sub,
//       role: decoded.role,
//       email: decoded.email,
//       name: decoded.name,
//     };
//     return next();
//   } catch (err: any) {
//     return next(new Error('Unauthorized: invalid token'));
//   }
// });

// ====== /chat 네임스페이스 커넥션 핸들러 ======
chatSocket.on('connection', async (socket) => {
  const decoded = tryVerify(extractTokenFromSocket(socket));
  socket.data.user = decoded
    ? { id: decoded.sub, role: decoded.role, email: decoded.email, name: decoded.name }
    : { id: `guest:${socket.id}`, role: 'GUEST' };

  const user = socket.data.user;
  console.log(`[chat] connected: socket=${socket.id} user=${user?.id}`);

  // 개인 알림 방 (선택)
  await socket.join(`user:${user.id}`);

  // ---- 방 참여 ----
  // payload: { conversationId: string|number }
  socket.on('room:join', async (payload) => {
    const conversationId = String(payload?.conversationId || '');
    if (!conversationId) return;

    try {
      // 🔑 숫자 유저만 멤버십 보장 시도, 게스트는 DB 확인 생략
      const isNumericUser = typeof user?.id === 'number' || /^\d+$/.test(String(user?.id));
      if (isNumericUser) {
        // ensureMember 오버로드(위치/객체) 어느 쪽이든 지원되도록 작성되어 있어야 함
        await ensureMember({ conversationId, userId: Number(user.id) });
      } else {
        // 게스트는 조용히 통과
        console.log(`[chat] guest join without ensureMember, conv=${conversationId}`);
      }

      await socket.join(`conv:${conversationId}`);

      // 참여 알림(옵션)
      socket.to(`conv:${conversationId}`).emit('room:joined', {
        conversationId,
        userId: user.id,
      });
    } catch (e) {
      console.error('[chat] room:join error', e);
      // 실패해도 방 조인은 시도 (권한은 REST가 관리)
      await socket.join(`conv:${conversationId}`);
    }
  });

  // ---- 방 이탈 ----
  socket.on('room:leave', async (payload) => {
    const conversationId = String(payload?.conversationId || '');
    if (!conversationId) return;
    try {
      await socket.leave(`conv:${conversationId}`);
      socket.to(`conv:${conversationId}`).emit('room:left', {
        conversationId,
        userId: user.id,
      });
    } catch (e) {
      console.error('[chat] room:leave error', e);
    }
  });

  // ---- 타이핑 표시 ----
  socket.on('typing', (payload) => {
    const conversationId = String(payload?.conversationId || '');
    if (!conversationId) return;
    socket.to(`conv:${conversationId}`).emit('typing', {
      conversationId,
      userId: user.id,
      isTyping: !!payload?.isTyping,
    });
  });

  // ---- 소켓 직접 전송(선택 기능) ----
  // 프론트는 현재 REST /chat/messages를 사용하지만, 혹시 소켓 전송을 쓸 때를 대비해
  // payload 포맷을 REST 브로드캐스트와 동일하게 맞춥니다.
  socket.on('message:send', async (payload, ack?: (res: any) => void) => {
    try {
      const conversationId = String(payload?.conversationId || '');
      const text = (payload?.text ?? '').trim();
      const files = payload?.files ?? null;

      if (!conversationId || (!text && !files)) {
        return ack?.({ ok: false, message: 'Invalid payload' });
      }

      const saved = await sendMessage({
        conversationId,
        senderId: (typeof user?.id === 'number') ? user.id : null, // 게스트 차단 가능
        text,
        files,
      });

      // 🔧 REST와 동일 포맷으로 변환 (created_at/text)
      const created_at =
        (saved?.sent_at && typeof saved.sent_at.toISOString === 'function')
          ? saved.sent_at.toISOString()
          : (saved?.createdAt?.toISOString?.() ?? saved?.createdAt ?? new Date().toISOString());

      const payloadForClient = {
        id: saved.id,
        room_id: saved.room_id,
        user_id: saved.sender_user_id,
        text: saved.content ?? text ?? '',
        created_at,
      };

      chatSocket.to(`conv:${conversationId}`).emit('message:new', payloadForClient);
      socket.emit('message:new', payloadForClient); // 자기 자신에게도 즉시 반영
      ack?.({ ok: true, data: payloadForClient });
    } catch (e) {
      console.error('[chat] message:send error', e);
      ack?.({ ok: false, message: 'Failed to send message' });
    }
  });

  socket.on('message:read', async (payload, ack?: (res: any) => void) => {
    try {
      const conversationId = String(payload?.conversationId || '');
      const messageId = payload?.messageId;
      if (!conversationId) return ack?.({ ok: false, message: 'Invalid payload' });

      await markRead({
        conversationId,
        userId: (typeof user?.id === 'number') ? user.id : null, // 게스트면 서버에서 무시 처리 가능
        messageId,
      });

      chatSocket.to(`conv:${conversationId}`).emit('message:read', {
        conversationId,
        userId: user.id,
        messageId: messageId ?? null,
        at: new Date().toISOString(),
      });

      ack?.({ ok: true, data: true }); 
    } catch (e) {
      console.error('[chat] message:read error', e);
      ack?.({ ok: false, message: 'Failed to mark read' });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`[chat] disconnected: socket=${socket.id} reason=${reason}`);
  });
});

// ===== /chat REST 라우터 연결 (방 열기/메시지 조회/읽음) =====
app.use('/chat', createChatRouter(io));

// ===== listen =====
server.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});
