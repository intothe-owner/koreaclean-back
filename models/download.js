// models/download.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Download extends Model {}

  Download.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        comment: '자료실 ID (PK)',
      },

      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '자료 제목',
      },

      description: {
        // 필요에 따라 TEXT / LONGTEXT
        type: DataTypes.TEXT('long'),
        allowNull: true,
        comment: '자료 설명 / 내용',
      },

      files: {
        // [{id?, name, url, size?, type?}, ...] 형태로 사용
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
      tableName: 'download',   // 실제 테이블명
      comment: '자료실',
      indexes: [
        { fields: ['createdAt'] },
        { fields: ['title'] },
      ],
      timestamps: true,     // createdAt/updatedAt 사용
      underscored: false,   // 카멜케이스 유지 (Notice와 동일 스타일)
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      paranoid: true,       // soft delete (deletedAt)
    }
  );

  return Download;
};
