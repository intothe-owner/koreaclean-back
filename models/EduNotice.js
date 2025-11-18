// models/EduNotice.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EduNotice extends Model {}

  EduNotice.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        comment: '교육공지 ID (PK)',
      },

      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '교육 공지 제목',
      },

      content: {
        // HTML 또는 일반 텍스트 저장
        type: DataTypes.TEXT('long'),
        allowNull: false,
        comment: '교육 공지 내용',
      },

      edu_start_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: '교육 시작일 (YYYY-MM-DD)',
      },

      edu_end_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: '교육 종료일 (YYYY-MM-DD)',
      },

      class_start_time: {
        // MySQL TIME 타입 (HH:MM[:SS])
        type: DataTypes.TIME,
        allowNull: false,
        comment: '수업 시작 시간 (HH:MM)',
      },

      class_end_time: {
        type: DataTypes.TIME,
        allowNull: false,
        comment: '수업 종료 시간 (HH:MM)',
      },

      attachments: {
        // [{id?, name, url?, size?}] 형태 JSON 배열
        type: DataTypes.JSON,
        allowNull: true,
        comment: '첨부파일 JSON 배열',
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
      tableName: 'edu_notice',
      comment: '교육 공지사항',
      indexes: [
        { fields: ['edu_start_date'] },
        { fields: ['edu_end_date'] },
        { fields: ['createdAt'] },
      ],
      timestamps: true,      // createdAt/updatedAt 사용
      underscored: false,    // 카멜케이스 컬럼 유지
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      paranoid: true,        // soft delete (deletedAt)
    }
  );

  return EduNotice;
};
