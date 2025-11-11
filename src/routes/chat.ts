// routes/chat.ts
import { Router } from 'express';
import type { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { ensureMember, listMessages, sendMessage } from '../service/chat.service';
import { Op } from 'sequelize';

// CJS export된 models
// eslint-disable-next-line @typescript-eslint/no-var-requires
const db = require('../../models');
const { User, ChatMember, ChatRoom } = db as any;

const ACCESS_SECRET = (process.env.JWT_ACCESS_SECRET ?? 'dev-access') as jwt.Secret;

export default function createChatRouter(io: Server) {
  const router = Router();

  // /chat 네임스페이스
  const chatNs = io.of('/chat');

  /** 소켓 연결 핸들링: 개인룸/대화방 조인 */
  chatNs.on('connection', (socket) => {
    // 클라: socket.emit("join:user", { user_id })
    socket.on('join:user', (payload: { user_id?: number }) => {
      const uid = Number(payload?.user_id);
      if (uid) socket.join(`user:${uid}`);
    });

    // 클라: socket.emit("join:conv", { room_id })
    socket.on('join:conv', (payload: { room_id?: number }) => {
      const rid = Number(payload?.room_id);
      if (rid) socket.join(`conv:${rid}`);
    });

    socket.on('disconnect', () => {
      // 필요 시 정리
    });
  });

  /** 공통: 인증 후 User 로드 */
  async function authAndGetUser(req: any, res: any) {
    try {
      const bearer = req.headers.authorization as string | undefined;
      const fromHeader = bearer?.startsWith('Bearer ') ? bearer.split(' ')[1] : undefined;
      const token = fromHeader || (req.cookies?.access_token as string | undefined);
      if (!token) {
        res.status(401).json({ is_success: false, message: '인증 토큰이 필요합니다.' });
        return null;
      }
      const decoded = jwt.verify(token, ACCESS_SECRET) as any;
      const user = await User.findByPk(decoded.sub);
      if (!user) {
        res.status(401).json({ is_success: false, message: '유효하지 않은 토큰입니다.' });
        return null;
      }
      return user;
    } catch {
      res.status(401).json({ is_success: false, message: 'UNAUTHORIZED' });
      return null;
    }
  }

  /** 프런트 표준 포맷 매핑 */
  function toClientMessage(m: any) {
    const createdAtISO =
      (m.sent_at && typeof m.sent_at.toISOString === 'function')
        ? m.sent_at.toISOString()
        : (m.created_at?.toISOString?.() ?? m.created_at ?? new Date().toISOString());
    return {
      id: m.id,
      room_id: m.room_id,
      user_id: m.sender_user_id ?? m.user_id,
      text: m.content ?? m.text ?? '',
      created_at: createdAtISO,
    };
  }

  /**
   * 1) 방 보장(없으면 생성) + 내 멤버십 보장
   * POST /chat/rooms/open
   * body: { conversationId?: number|string, service_request_id?: number|string, role_hint?: string }
   */
  router.post('/rooms/open', async (req, res) => {
    try {
      const user = await authAndGetUser(req, res);
      if (!user) return;
      console.log('data',req.body);
      const { conversationId: rawConv, service_request_id, role_hint } = req.body || {};
      const conversationId = rawConv ?? service_request_id;
      if (!conversationId) {
        return res.status(400).json({ is_success: false, message: 'conversationId 또는 service_request_id가 필요합니다.' });
      }

      const { room, member } = await ensureMember({
        conversationId,
        userId: user.id,
        roleHint: role_hint || user?.role,
      });

      return res.json({
        is_success: true,
        room: {
          id: room.id,
          service_request_id: room.service_request_id,
          last_message: room.last_message,
          last_message_at: room.last_message_at,
          is_closed: room.is_closed,
        },
        member,
      });
    } catch (err: any) {
      return res.status(500).json({ is_success: false, message: err?.message || 'open failed' });
    }
  });

  /**
   * 2) 메시지 목록
   */
  router.get('/rooms/:conversation_id/messages', async (req, res) => {
    try {
      const user = await authAndGetUser(req, res);
      if (!user) return;

      const conversationId = req.params.conversation_id;
      const limit = Math.min(Number(req.query.limit || 30), 100);
      const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
      const dir = (String(req.query.dir || 'backward') as 'backward' | 'forward');

      const { items, nextCursor } = await listMessages({
        conversationId,
        userId: user.id,
        limit,
        cursor,
        dir,
      });

      const mapped = Array.isArray(items) ? items.map(toClientMessage) : [];
      return res.json({ is_success: true, items: mapped, nextCursor });
    } catch (err: any) {
      return res.status(500).json({ is_success: false, message: err?.message || 'list failed' });
    }
  });

  /**
   * 3) 읽음 처리
   * POST /chat/rooms/:id/read
   * - 내 멤버십의 unread_count = 0, last_read_at 갱신
   * - 내 개인 룸(user:{id})과 방 룸(conv:{room_id})으로 브로드캐스트
   *   ※ 프런트 뱃지 타깃팅을 위해 service_request_id 포함
   */
  router.post('/rooms/:id/read', async (req, res) => {
    try {
      const user = await authAndGetUser(req, res);
      if (!user) return;

      const conversationId = String(req.params.id);
      const convIdNum = Number(conversationId);
      if (!convIdNum) {
        return res.status(400).json({ is_success: false, message: '유효하지 않은 room id' });
      }

      // 방 메타(서비스요청ID) 추출
      let service_request_id: number | undefined;
      try {
        const room = await ChatRoom.findByPk(convIdNum, { attributes: ['service_request_id'], raw: true });
        if (room?.service_request_id) service_request_id = Number(room.service_request_id);
      } catch {}

      await ChatMember.update(
        { unread_count: 0, last_read_at: new Date() },
        { where: { room_id: convIdNum, user_id: user.id } }
      );

      // 내 배지 즉시 0으로
      chatNs.to(`user:${user.id}`).emit('room:unread', {
        room_id: convIdNum,
        unread_count: 0,
        service_request_id, // ✅ 프런트가 해당 서비스요청 뱃지를 0으로
      });

      // (옵션) 방 참여자들에게 '누가 읽었다' 브로드캐스트
      chatNs.to(`conv:${convIdNum}`).emit('room:read', {
        room_id: convIdNum,
        user_id: user.id,
      });

      return res.json({ is_success: true });
    } catch (err: any) {
      return res.status(500).json({ is_success: false, message: err?.message || 'read failed' });
    }
  });

  /**
   * 4) 메시지 저장 + 수신자 unread 증가 + 브로드캐스트
   * POST /chat/messages
   * body: { conversationId?: number|string, room_id?: number, text?: string, files?: any[], message_type?: 'TEXT'|'IMAGE'|'FILE'|'SYSTEM' }
   */
  router.post('/messages', async (req, res) => {
    try {
      const user = await authAndGetUser(req, res);
      if (!user) return;

      const { conversationId: rawConv, room_id, text, files, message_type } = req.body || {};
      const conversationId = rawConv ?? room_id;
      const convIdNum = Number(conversationId);
      if (!convIdNum) {
        return res.status(400).json({ is_success: false, message: 'conversationId (또는 room_id)가 필요합니다.' });
      }

      // 1) 메시지 저장
      const saved = await sendMessage({
        conversationId: convIdNum,
        senderId: user.id,
        text,
        files,
        messageType: message_type,
      });
      const payload = toClientMessage(saved);

      // 2) 수신자 조회
      const members = await ChatMember.findAll({
        attributes: ['user_id'],
        where: { room_id: convIdNum },
        raw: true,
      });
      const targetUserIds: number[] = members
        .map((m: any) => Number(m.user_id))
        .filter((uid: number) => uid && uid !== user.id);

      // 3) 미읽음 +1 (수신자들만)
      if (targetUserIds.length > 0) {
        await ChatMember.increment(
          { unread_count: 1 },
          { where: { room_id: convIdNum, user_id: { [Op.in]: targetUserIds } } }
        );
      }

      // 방 메타(서비스요청ID) 추출
      let service_request_id: number | undefined;
      try {
        const room = await ChatRoom.findByPk(convIdNum, { attributes: ['service_request_id'], raw: true });
        if (room?.service_request_id) service_request_id = Number(room.service_request_id);
      } catch {}

      // 4) 방 룸으로 새 메시지 브로드캐스트
      chatNs.to(`conv:${convIdNum}`).emit('message:new', payload);


      // 5) 각 수신자 개인 룸으로 최신 unread 카운트 브로드캐스트(+ service_request_id)
      if (targetUserIds.length > 0) {
        const rows = await ChatMember.findAll({
          attributes: ['user_id', 'unread_count'],
          where: { room_id: convIdNum, user_id: { [Op.in]: targetUserIds } },
          raw: true,
        });

        for (const r of rows) {
          const targetUid = Number(r.user_id);
          const unread = Number(r.unread_count) || 0;

          chatNs.to(`user:${targetUid}`).emit('room:unread', {
            room_id: convIdNum,
            unread_count: unread,
            service_request_id, // ✅ 프런트 뱃지 타깃팅
          });
        }
      }

      return res.json({ is_success: true, item: payload });
    } catch (err: any) {
      return res.status(500).json({ is_success: false, message: err?.message || 'send failed' });
    }
  });

  return router;
}
