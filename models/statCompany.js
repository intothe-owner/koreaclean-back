// models/StatCompany.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StatCompany extends Model {}

  StatCompany.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },

      // 엑셀에서 매칭할 때 쓰기 좋은 코드 (선택)
      // 예: C001, C002 ...
      code: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        comment: '기업 코드 (엑셀/내부 매칭용)',
      },

      // 기업명
      name: {
        type: DataTypes.STRING(150),
        allowNull: false,
        comment: '기업명',
      },

      // 대표자명 (필요 없으면 allowNull: true 로 바꿔도 됨)
      ceo: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '대표자명(선택)',
      },

      // 본사 기준 지역(선택)
      // 예: '부산', '경남', '서울' 등
      region_level1: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '기본 권역(시/도)',
      },

      // 예: '해운대구', '남구' 등
      region_level2: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '기본 지역(시/군/구)',
      },

      // 정렬용
      sort_order: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '표시 순서',
      },

      // 사용 여부
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '사용 여부',
      },

      // 메모/비고
      memo: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '비고',
      },
    },
    {
      sequelize,
      tableName: 'stat_company',
      timestamps: true, // createdAt, updatedAt
      underscored: false,
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      paranoid: false,
      indexes: [
        { fields: ['code'] },
        { fields: ['name'] },
        { fields: ['region_level1'] },
        { fields: ['region_level2'] },
      ],
    }
  );

  // 👉 요청대로 다른 테이블과 관계 안 맺음
  return StatCompany;
};
