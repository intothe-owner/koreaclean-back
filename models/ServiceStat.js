// models/ServiceStat.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ServiceStat extends Model {}

  ServiceStat.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },

      // 통계 대상 기업 (StatCompany.id)
      company_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        comment: '통계 대상 기업 ID (stat_company.id)',
      },

      // 통계 기간 키 (임의 문자열)
      // 예: '2025', '2025-H2', '2025-Q1', '2025-11', '2025년 하반기' 등
      period_key: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: '전체',
        comment: '통계 기준 기간 키',
      },

      // 지역 키 (임의 문자열)
      // 예: '부산>해운대구', '부산>전체', '경남>거제시', '전국' 등
      region_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        defaultValue: '전체',
        comment: '지역 키',
      },

      // 통계 항목 코드 (프로그램 내부용)
      // 예: 'AIRCON_DONE', 'AIRCON_REQUEST', 'TOTAL_SENIOR_CENTER'
      metric_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '통계 항목 코드 (내부용)',
      },

      // 사람 눈에 보이는 통계 항목 이름
      // 예: '에어컨 세척 완료 건수', '총 매출', '경로당 수'
      metric_label: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '통계 항목 이름 (표출용)',
      },

      // 값 타입 (선택이지만 나중에 시각화 할 때 유용)
      metric_type: {
        type: DataTypes.ENUM('COUNT', 'AMOUNT', 'RATIO', 'OTHER'),
        allowNull: false,
        defaultValue: 'COUNT',
        comment: '값 타입: 건수/금액/비율/기타',
      },

      // 실제 통계 값 (임의 통계라 공통으로 숫자 하나만)
      value: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '통계 값',
      },

      // 단위 (건, 원, %, 개 등)
      unit: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: '건',
        comment: '단위 (예: 건, 원, %, 개 등)',
      },

      // 비고/설명
      note: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '비고/설명',
      },
    },
    {
      sequelize,
      tableName: 'service_stat',
      timestamps: true,
      underscored: false,
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      paranoid: false,
      indexes: [
        { fields: ['company_id'] },
        { fields: ['period_key'] },
        { fields: ['region_key'] },
        { fields: ['metric_code'] },
        {
          // 같은 기업/기간/지역/항목 조합은 1행만 있게 만들고 싶으면 유니크
          unique: true,
          fields: ['company_id', 'period_key', 'region_key', 'metric_code'],
        },
      ],
    }
  );

  // 👉 여기서도 관계(associations) 일절 안 맺음
  return ServiceStat;
};
