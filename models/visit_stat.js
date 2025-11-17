// models/visit_stat.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class VisitStat extends Model {}

  VisitStat.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        comment: 'PK',
      },

      // 집계 날짜 (YYYY-MM-DD 단위)
      stat_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: '집계 날짜 (예: 2025-11-17)',
      },

      // 어떤 페이지인지 구분 (URL path 기준)
      path: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '요청 경로 (예: /, /service-request, /admin/dashboard)',
      },

      // 해당 날짜 + 페이지의 총 접속 수
      view_count: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '해당 날짜/페이지의 총 접속 수',
      },
    },
    {
      sequelize,
      tableName: 'visit_stat',
      comment: '페이지별 일자 방문 통계',
      timestamps: true,
      paranoid: true,
      underscored: false,
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      deletedAt: 'deletedAt',
      charset: 'utf8mb4',
      collate: 'utf8mb4_general_ci',
      indexes: [
        {
          // 날짜 + 경로 조합 1개만 존재하도록 (UPSERT 용이)
          unique: true,
          fields: ['stat_date', 'path'],
        },
        {
          fields: ['path'],
        },
        {
          fields: ['stat_date'],
        },
      ],
    }
  );

  return VisitStat;
};
