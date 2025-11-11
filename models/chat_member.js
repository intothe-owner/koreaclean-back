// models/chat_member.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ChatMember extends Model {}

  ChatMember.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        comment: 'PK',
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
      role: {
        type: DataTypes.ENUM('CLIENT', 'COMPANY', 'ADMIN'),
        allowNull: true,
        defaultValue: null,
        comment: '멤버 역할(선택)',
      },
      unread_count: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '해당 방의 내 미읽음 개수',
      },
      last_read_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '마지막 읽은 시간',
      },
      joined_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '방 합류 시각(선택)',
      },
      is_muted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '알림 끄기',
      },
    },
    {
      sequelize,
      tableName: 'chat_member',
      comment: '채팅방-사용자 멤버십',
      timestamps: true,
      paranoid: true,
      underscored: false, // ChatRoom에 맞춰 유지
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      deletedAt: 'deletedAt',
      charset: 'utf8mb4',
      collate: 'utf8mb4_general_ci',
      indexes: [
        { unique: true, fields: ['room_id', 'user_id'] },   // 중복가입 방지
        { fields: ['user_id'] },
        { fields: ['room_id'] },
        { fields: ['unread_count'] },
      ],
    }
  );

  return ChatMember;
};
