// src/models/review.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Review extends Model {}

  Review.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        comment: '후기 ID',
      },

      // 제목
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '후기 제목',
      },

      // 본문
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '후기 내용',
      },

      // 별점 (1~5)
      rating: {
        type: DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
        defaultValue: 5,
        validate: { min: 1, max: 5 },
        comment: '별점(1~5)',
      },

      // 대표 사진 URL
      photo_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '대표 사진 URL',
      },

      // 노출 상태
      status: {
        type: DataTypes.ENUM('PUBLISHED', 'HIDDEN', 'PENDING'),
        allowNull: false,
        defaultValue: 'PUBLISHED',
        comment: '노출 상태',
      },

      // 작성자 (로그인 유저)
      reviewer_user_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        comment: '후기 작성자 사용자 ID (FK→user.id)',
      },
    },
    {
      sequelize,
      tableName: 'review',
      comment: '고객 후기',
      timestamps: true,
      underscored: false,      // Inquiry와 동일 스타일 유지
      createdAt: 'createdAt',  // camelCase 필드명
      updatedAt: 'updatedAt',
      paranoid: true,          // deletedAt 사용
      indexes: [
        { fields: ['status'] },
        { fields: ['rating'] },
        { fields: ['reviewer_user_id'] },
        { fields: ['createdAt'] },
      ],
    }
  );

  return Review;
};
