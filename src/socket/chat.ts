// socket/chat.ts (예시)
import { Server } from "socket.io";
import { verify } from "jsonwebtoken";

export function mountChat(io: Server) {
  const chatNs = io.of("/chat");

  chatNs.on("connection", async (socket) => {
    // 1) 유저 개인 룸 조인: handshake auth 또는 이벤트로 전달된 user_id 사용
    const meId = Number(socket.handshake.auth?.user_id) || undefined;
    if (meId) socket.join(`user:${meId}`);

    // 2) 명시적 유저 조인 (클라에서 emit)
    socket.on("user:join", ({ user_id }) => {
      if (user_id) socket.join(`user:${Number(user_id)}`);
    });

    // 3) 대화방 조인/이탈
    socket.on("room:join", ({ room_id }) => {
      if (!room_id) return;
      socket.join(`conv:${room_id}`);
    });
    socket.on("room:leave", ({ room_id }) => {
      if (!room_id) return;
      socket.leave(`conv:${room_id}`);
    });
  });

  return chatNs;
}
