// models/Notice.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Notice extends Model {}

  Notice.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        comment: '공지 ID (PK)',
      },

      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '공지 제목',
      },

      content: {
        // HTML 또는 일반 텍스트 저장
        // (MySQL이면 LONGTEXT 필요 시 TEXT("long")로 변경 가능)
        type: DataTypes.TEXT('long'),
        allowNull: false,
        comment: '공지 본문',
      },

      priority: {
        // EMERGENCY | IMPORTANT | NORMAL
        type: DataTypes.ENUM('EMERGENCY', 'IMPORTANT', 'NORMAL'),
        allowNull: false,
        defaultValue: 'NORMAL',
        comment: '중요도',
      },

      is_pinned: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '상단 고정 여부',
      },

      attachments: {
        // [{id?, name, url?, size?}] 형태 권장
        type: DataTypes.JSON,
        allowNull: true,
        comment: '첨부파일 JSON 배열',
      },

      views: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '조회수',
      },

      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '등록 시각',
      },

      updatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '수정 시각',
      },

      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '삭제 시각(soft delete)',
      },
    },
    {
      sequelize,
      tableName: 'notice',
      comment: '공지사항',
      indexes: [
        { fields: ['priority'] },
        { fields: ['is_pinned'] },
        { fields: ['createdAt'] },
        // MySQL에서 제목/본문 검색 최적화가 필요하면 FULLTEXT 인덱스 고려
        // { type: 'FULLTEXT', fields: ['title', 'content'] },
      ],
      timestamps: true,      // createdAt/updatedAt 사용
      underscored: false,    // 카멜케이스 컬럼 유지
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      paranoid: true,        // soft delete (deletedAt)
    }
  );

  return Notice;
};
