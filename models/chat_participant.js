// models/chat_participant.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ChatParticipant extends Model {}

  ChatParticipant.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        comment: '참가자 ID (PK)',
      },
      room_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        comment: 'ChatRoom.id',
      },
      user_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        comment: 'User.id',
      },
      // CLIENT: 신청자 / COMPANY: 배정된 업체(담당자) / ADMIN: 내부운영자 등
      role: {
        type: DataTypes.ENUM('CLIENT', 'COMPANY', 'ADMIN'),
        allowNull: false,
        defaultValue: 'CLIENT',
        comment: '참가자 역할',
      },
      joined_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '방 합류 시각',
      },
      last_read_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '해당 참가자의 마지막 읽음 시각',
      },
      is_muted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '알림 음소거 여부',
      },
    },
    {
      sequelize,
      tableName: 'chat_participant',
      comment: '채팅방 참가자',
      timestamps: true,
      paranoid: true,
      underscored: false,
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      deletedAt: 'deletedAt',
      charset: 'utf8mb4',
      collate: 'utf8mb4_general_ci',
      indexes: [
        { fields: ['room_id'] },
        { fields: ['user_id'] },
        { unique: true, fields: ['room_id', 'user_id'] }, // 동일 방 중복 참가 방지
      ],
    }
  );

  return ChatParticipant;
};
