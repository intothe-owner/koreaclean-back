// src/validators/chat.dto.ts
export type CreateRoomBody = {
  service_request_id: number;
  company_id?: number | null; // 미배정 허용
  title?: string | null;
};

export type SendMessageBody = {
  type?: 'TEXT'|'IMAGE'|'FILE'|'SYSTEM'; // 기본 TEXT
  content?: string | null;
  attachments?: any; // JSON (배열 권장)
};

export type ReadBody = {
  last_read_message_id?: number | null;
  usePerMessageReceipt?: boolean; // true면 ChatMessageRead 생성
};

export type PaginationQuery = {
  cursor?: string; // message id 기준 커서
  limit?: string;  // 기본 30
};
