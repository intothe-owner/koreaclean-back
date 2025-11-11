// models/chat_message.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ChatMessage extends Model {}

  ChatMessage.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        comment: '메시지 ID (PK)',
      },
      room_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        comment: 'ChatRoom.id',
      },
      sender_user_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        comment: '발신자 User.id',
      },
      message_type: {
        type: DataTypes.ENUM('TEXT', 'IMAGE', 'FILE', 'SYSTEM'),
        allowNull: false,
        defaultValue: 'TEXT',
        comment: '메시지 타입',
      },
      content: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
        comment: '본문(텍스트/시스템)',
      },
      files: {
        // 업로드 파일 메타(JSON 배열) [{url,name,size,type}, ...]
        type: DataTypes.JSON,
        allowNull: true,
        comment: '첨부 파일 정보(JSON)',
      },
      sent_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '보낸 시각',
      },
      // 간단 읽음 처리: 메시지 생성 후, 방의 참가자 수로 비교할 때 사용 가능
      read_count: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '읽은 인원 수(옵셔널 캐시)',
      },
      is_edited: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '수정 여부',
      },
      edited_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '수정 시각',
      },
    },
    {
      sequelize,
      tableName: 'chat_message',
      comment: '채팅 메시지',
      timestamps: true,
      paranoid: true,
      underscored: false,
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      deletedAt: 'deletedAt',
      charset: 'utf8mb4',
      collate: 'utf8mb4_general_ci',
      indexes: [
        { fields: ['room_id', 'sent_at'] },
        { fields: ['sender_user_id'] },
        { fields: ['message_type'] },
      ],
    }
  );

  return ChatMessage;
};
