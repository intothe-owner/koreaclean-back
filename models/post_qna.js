// models/post_qna.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PostQna extends Model {}

  PostQna.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        comment: 'QnA 게시글 ID (PK)',
      },
      client_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        comment: '작성자(회원) Users.id',
      },
      user_email:{
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '비회원일 때 user_email',
      },
      category: {
        type: DataTypes.ENUM('서비스 신청', '변경', '취소', '불만사항', '제안'),
        allowNull: false,
        comment: '문의 카테고리',
      },
      title: {
        type: DataTypes.STRING(300),
        allowNull: false,
        comment: '제목',
      },
      merged_content: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
        comment: '내용',
      },
      content: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
        comment: '내용',
      },
      // 🔹 첨부파일 JSON 배열: [{ id,url,name,size,type }]
      files: {
        type: DataTypes.JSON, // MySQL 5.7+/MariaDB 10.2+/PostgreSQL OK
        allowNull: false,
        defaultValue: [],
        comment: '첨부파일 메타(JSON 배열)',
      },
      status: {
        type: DataTypes.ENUM('NEW', 'ANSWERED', 'REOPENED', 'CLOSED'),
        allowNull: false,
        defaultValue: 'NEW',
        comment: '처리 상태',
      },
      comment_count: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '댓글 수(캐시)',
      },
      last_commented_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '최근 댓글 시간(정렬용)',
      },
      is_private: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '비공개 여부(작성자/관리자만 열람)',
      },
    },
    {
      sequelize,
      tableName: 'post_qna', // ← 요청하신 명칭
      comment: '문의하기 게시글',
      timestamps: true,
      paranoid: true,
      underscored: false,
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      deletedAt: 'deletedAt',
      charset: 'utf8mb4',
      collate: 'utf8mb4_general_ci',
      indexes: [
        { fields: ['client_id'] },
        { fields: ['category'] },
        { fields: ['status'] },
        { fields: ['is_private'] },
        { fields: ['last_commented_at'] },
        { fields: ['createdAt'] },
      ],
    }
  );

  return PostQna;
};
