// src/models/inquiry.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Inquiry extends Model {}

  Inquiry.init({
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
      comment: '문의 ID',
    },

    // 제목
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
      comment: '문의 제목',
    },

    // 상태
    status: {
      type: DataTypes.ENUM('OPEN', 'ANSWERED', 'CLOSED'),
      allowNull: false,
      defaultValue: 'OPEN',
      comment: '문의 상태',
    },

    // 본문
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: '문의 내용',
    },

    // 맥락 연결: 서비스 신청
    service_request_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      comment: '연결된 서비스 신청 ID (FK→service_request.id)',
    },

    // 작성자 (기관/클라이언트 사용자)
    requester_user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      comment: '문의 등록자 사용자 ID (FK→user.id)',
    },

    // 대상 업체 (선택)
    company_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      comment: '문의 대상 업체 ID (FK→company.id)',
    },

  }, {
    sequelize,
    tableName: 'inquiry',
    comment: '1:1 문의(게시판형)',
    timestamps: true,
    underscored: false,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    paranoid: true,
    indexes: [
      { fields: ['status'] },
      { fields: ['requester_user_id'] },
      { fields: ['company_id'] },
      { fields: ['service_request_id'] },
    ],
  });

  return Inquiry;
};
