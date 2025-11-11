// src/socket.ts
import { Server } from 'socket.io';
import http from 'http';
import { ensureMember, sendMessage, markRead } from './service/chat.service';

export function attachSocket(server: http.Server) {
  const io = new Server(server, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    // 인증 토큰 파싱/검증 로직은 프로젝트 규칙에 맞게 추가
    const userId = Number(socket.handshake.auth?.userId);
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    socket.on('join_room', async ({ roomId, role }) => {
      await ensureMember(roomId, userId, role ?? 'REQUESTER');
      socket.join(`room:${roomId}`);
      io.to(`room:${roomId}`).emit('presence', { roomId, userId, state: 'join' });
    });

    socket.on('leave_room', ({ roomId }) => {
      socket.leave(`room:${roomId}`);
      io.to(`room:${roomId}`).emit('presence', { roomId, userId, state: 'leave' });
    });

    socket.on('send_message', async ({ roomId, type, content, attachments }) => {
      const msg = await sendMessage({
        room_id: roomId,
        author_user_id: userId,
        type: type ?? 'TEXT',
        content: content ?? null,
        attachments: attachments ?? null,
      });
      io.to(`room:${roomId}`).emit('new_message', { message: msg });
    });

    socket.on('read', async ({ roomId, last_read_message_id, perMessage }) => {
      await markRead({
        room_id: roomId,
        user_id: userId,
        last_read_message_id,
        usePerMessageReceipt: !!perMessage,
      });
      io.to(`room:${roomId}`).emit('read', { roomId, userId, last_read_message_id });
    });

    socket.on('typing', ({ roomId, state }) => {
      io.to(`room:${roomId}`).emit('typing', { roomId, userId, state: !!state });
    });
  });

  return io;
}
