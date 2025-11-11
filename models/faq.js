// models/faq.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Faq extends Model {}

  Faq.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        comment: 'FAQ ID (PK)',
      },
      category: {
        // 고정 카테고리 4종
        type: DataTypes.ENUM('홈페이지관련', '회원관련', '서비스신청관련', '업체관련'),
        allowNull: false,
        comment: 'FAQ 카테고리',
      },
      question: {
        type: DataTypes.STRING(500), // 길면 TEXT로 변경 가능
        allowNull: false,
        comment: '질문',
      },
      answer: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
        comment: '답변',
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '노출 여부',
      },
      order_no: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: '정렬 번호(작을수록 상단)',
      },
    },
    {
      sequelize,
      tableName: 'faq', // 테이블명: 단수형 사용 (프로젝트 스타일에 맞춤)
      comment: '자주 묻는 질문(FAQ)',
      timestamps: true,         // createdAt/updatedAt
      paranoid: true,           // soft delete: deletedAt
      underscored: false,       // 카멜케이스 컬럼명
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      deletedAt: 'deletedAt',
      charset: 'utf8mb4',
      collate: 'utf8mb4_general_ci',
      indexes: [
        { fields: ['category'] },
        { fields: ['is_active'] },
        { fields: ['order_no'] },
      ],
    }
  );

  return Faq;
};
