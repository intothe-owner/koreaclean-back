// src/models/inquiryComment.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class InquiryComment extends Model {}

  InquiryComment.init({
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
      comment: '댓글 ID',
    },

    // 어떤 문의의 댓글인지 (필수)
    inquiry_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      comment: 'FK → inquiry.id',
    },

    // 대댓글(선택): 최상위 댓글이면 null
    parent_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      comment: '부모 댓글 ID (self FK)',
    },

    // 작성자
    author_user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      comment: '댓글 작성자 사용자 ID (FK → user.id)',
    },

    // 작성자 역할(표시/권한용)
    author_role: {
      type: DataTypes.ENUM('CLIENT', 'COMPANY', 'ADMIN'),
      allowNull: false,
      defaultValue: 'CLIENT',
      comment: '작성자 역할',
    },

    // 본문
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: '댓글 내용',
    },

    // (선택) 첨부 JSON
    attachments: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '첨부 파일/이미지 등(JSON)',
    },

  }, {
    sequelize,
    tableName: 'inquiry_comment',
    comment: '1:1 문의 댓글(스레드형)',
    timestamps: true,
    underscored: false,   // Inquiry 모델과 맞춤
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    paranoid: true,
    indexes: [
      { fields: ['inquiry_id'] },
      { fields: ['parent_id'] },
      { fields: ['author_user_id'] },
      { fields: ['author_role'] },
      { fields: ['createdAt'] },
    ],
  });

  return InquiryComment;
};
