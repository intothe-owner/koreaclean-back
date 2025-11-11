// service/chat.service.ts
import { Op } from 'sequelize';

// CJS export된 models 사용
// eslint-disable-next-line @typescript-eslint/no-var-requires
const db = require('../../models');
const {
  ChatRoom,
  ChatMember,          // ✅ 기존 ChatParticipant → ChatMember
  ChatMessage,
  ServiceRequest,
  User,
} = db as any;

/** 내부 유틸: conversationId를 방으로 해석
 *  1) ChatRoom.id 로 찾아보고
 *  2) 없으면 ChatRoom.service_request_id 로 찾아본다.
 */
async function resolveRoom(conversationId: number | string) {
  const idNum = Number(conversationId);
  if (!Number.isNaN(idNum)) {
    const byPk = await ChatRoom.findByPk(idNum);
    if (byPk) return byPk;
  }
  // 서비스신청ID로 매칭되는 방
  const bySvc = await ChatRoom.findOne({
    where: { service_request_id: conversationId },
  });
  return bySvc;
}

/** 내부 유틸: 서비스신청ID로 방을 보장(없으면 생성) */
async function ensureRoomByServiceRequestId(service_request_id: number | string) {
  const reqRow = await ServiceRequest.findByPk(service_request_id);
  if (!reqRow) throw new Error('ServiceRequest not found');

  let room = await ChatRoom.findOne({ where: { service_request_id } });
  if (!room) {
    room = await ChatRoom.create({
      service_request_id,
      title: null,
      is_closed: false,
      last_message: null,
      last_message_at: null,
    });
    return { room, created: true };
  }
  return { room, created: false };
}

type EnsureMemberArgs = {
  conversationId: number | string;               // ChatRoom.id 또는 ServiceRequest.id
  userId: number | string;
  roleHint?: 'CLIENT' | 'COMPANY' | 'ADMIN' | string;
};

/** 멤버십 보장
 *  - conversationId: ChatRoom.id 또는 ServiceRequest.id
 *  - ServiceRequest.id가 오면 방 없을 시 생성
 *  - 멤버십 없으면 ChatMember 생성(unread_count=0)
 */
async function ensureMemberObj(args: EnsureMemberArgs) {
  const { conversationId, userId, roleHint } = args;

  let room = await resolveRoom(conversationId);
  if (!room) {
    const { room: ensured } = await ensureRoomByServiceRequestId(conversationId);
    room = ensured;
  }

  let member = await ChatMember.findOne({
    where: { room_id: room.id, user_id: userId },
  });

  if (!member) {
    const role =
      roleHint === 'COMPANY' || roleHint === 'ADMIN' ? roleHint : 'CLIENT';
    member = await ChatMember.create({
      room_id: room.id,
      user_id: userId,
      role,
      joined_at: new Date(),
      is_muted: false,
      unread_count: 0,
      last_read_at: null,
    });
  }

  return { room, member };
}

// ===== 공개 API: 위치 인자/객체 인자 둘 다 허용 =====
export async function ensureMember(
  conversationId: number | string,
  userId: number | string,
  roleHint?: string
): Promise<{ room: any; member: any }>;
export async function ensureMember(args: EnsureMemberArgs): Promise<{ room: any; member: any }>;
export async function ensureMember(
  a: any,
  b?: any,
  c?: any
): Promise<{ room: any; member: any }> {
  if (typeof a === 'object' && a !== null && 'conversationId' in a) {
    return ensureMemberObj(a as EnsureMemberArgs);
  }
  return ensureMemberObj({ conversationId: a, userId: b, roleHint: c });
}

type SendMessageArgs = {
  /** ChatRoom.id 또는 ServiceRequest.id */
  conversationId: number | string;
  senderId: number | string;
  text?: string;
  files?: Array<{ url: string; name?: string; size?: number; type?: string }>;
  messageType?: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';
};

/** 메시지 전송 (저장 + 방 캐시 + 보낸사람 last_read_at 갱신)
 *  - 수신자 unread_count +1 은 라우터에서 처리(이미 구현됨)
 */
export async function sendMessage(args: SendMessageArgs) {
  const {
    conversationId,
    senderId,
    text,
    files,
    messageType = 'TEXT',
  } = args;

  // 1) 방 resolve (둘 다 지원)
  let room = await resolveRoom(conversationId);
  if (!room) {
    const ensured = await ensureRoomByServiceRequestId(conversationId);
    room = ensured.room;
  }
  if (!room) throw new Error('ChatRoom not found');

  // 2) 멤버십 확인
  const joined = await ChatMember.findOne({
    where: { room_id: room.id, user_id: senderId },
  });
  if (!joined) throw new Error('Not a member');

  // 3) 메시지 생성
  const sent_at = new Date();
  const content = (text ?? '').trim();

  const msg = await ChatMessage.create({
    room_id: room.id,
    sender_user_id: senderId,
    message_type: messageType,
    content: content || null,
    files: files?.length ? files : null,
    sent_at,
    read_count: 0,
    is_edited: false,
    edited_at: null,
  });

  // 4) 방 최신메시지 캐시
  await room.update({
    last_message: messageType === 'TEXT' ? (content || '') : `[${messageType}]`,
    last_message_at: sent_at,
  });

  // 5) 보낸 사람의 읽음 커서(선택)
  await ChatMember.update(
    { last_read_at: sent_at },
    { where: { room_id: room.id, user_id: senderId } }
  );

  // 6) 직렬화 반환
  return {
    id: msg.id,
    room_id: msg.room_id,
    sender_user_id: msg.sender_user_id,
    message_type: msg.message_type,
    content: msg.content,
    files: msg.files,
    sent_at: msg.sent_at,
    createdAt: msg.createdAt,
  };
}

type ListMessagesArgs = {
  /** ChatRoom.id 또는 ServiceRequest.id */
  conversationId: number | string;
  userId: number | string;
  limit: number;
  cursor?: string; // ISO date
  dir?: 'backward' | 'forward';
};

export async function listMessages(args: ListMessagesArgs) {
  const { conversationId, userId, limit, cursor, dir = 'backward' } = args;

  // 방 resolve
  const room = await resolveRoom(conversationId);
  if (!room) throw new Error('ChatRoom not found');

  // 멤버 확인
  const joined = await ChatMember.findOne({
    where: { room_id: room.id, user_id: userId },
  });
  if (!joined) throw new Error('Not a member');

  const where: any = { room_id: room.id };
  if (cursor) {
    const op = dir === 'backward' ? Op.lt : Op.gt;
    where.sent_at = { [op]: new Date(cursor) };
  }

  const order = dir === 'backward' ? [['sent_at', 'DESC']] : [['sent_at', 'ASC']];

  const rows = await ChatMessage.findAll({
    where,
    order,
    limit,
  });

  const items = rows.map((r: any) => ({
    id: r.id,
    room_id: r.room_id,
    sender_user_id: r.sender_user_id,
    message_type: r.message_type,
    content: r.content,
    files: r.files,
    sent_at: r.sent_at,
    createdAt: r.createdAt,
  }));

  let nextCursor: string | null = null;
  if (items.length > 0) {
    const edge = items[items.length - 1];
    nextCursor = edge.sent_at?.toISOString?.() || null;
  }

  return {
    items: dir === 'backward' ? items.reverse() : items,
    nextCursor,
  };
}

type MarkReadArgs = {
  /** ChatRoom.id 또는 ServiceRequest.id */
  conversationId: number | string;
  userId: number | string;
  messageId?: number | string | null;
};

/** 읽음 처리(서비스 레이어 버전)
 *  - last_read_at 갱신 + unread_count 0으로 초기화 (라우터에서도 직접 업데이트하지만, 서비스 함수도 제공)
 */
export async function markRead(args: MarkReadArgs) {
  const { conversationId, userId } = args;

  const room = await resolveRoom(conversationId);
  if (!room) throw new Error('ChatRoom not found');

  const joined = await ChatMember.findOne({
    where: { room_id: room.id, user_id: userId },
  });
  if (!joined) throw new Error('Not a member');

  await ChatMember.update(
    { last_read_at: new Date(), unread_count: 0 },
    { where: { room_id: room.id, user_id: userId } }
  );

  // messageId 별 read-tracking 이 필요하면 여기서 확장(ChatRead 테이블 등)
  return true;
}
