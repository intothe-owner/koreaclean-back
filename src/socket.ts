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

    
    socket.on('typing', ({ roomId, state }) => {
      io.to(`room:${roomId}`).emit('typing', { roomId, userId, state: !!state });
    });
  });

  return io;
}
