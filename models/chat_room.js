// models/chat_room.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ChatRoom extends Model {}

  ChatRoom.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        comment: '채팅방 ID (PK)',
      },
      service_request_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        comment: 'ServiceRequest.id (서비스신청 기준 1:1 방)',
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '방 제목(선택)',
      },
      last_message: {
        type: DataTypes.TEXT('medium'),
        allowNull: true,
        comment: '최근 메시지 내용 캐시(리스트 표시용)',
      },
      last_message_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '최근 메시지 시각',
      },
      is_closed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '방 종료 여부',
      },
    },
    {
      sequelize,
      tableName: 'chat_room',
      comment: '서비스신청 단위 1:1 채팅방',
      timestamps: true,
      paranoid: true,
      underscored: false,
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      deletedAt: 'deletedAt',
      charset: 'utf8mb4',
      collate: 'utf8mb4_general_ci',
      indexes: [
        { unique: true, fields: ['service_request_id'] }, // 신청 1건당 방 1개
        { fields: ['last_message_at'] },
        { fields: ['is_closed'] },
      ],
    }
  );

  return ChatRoom;
};
