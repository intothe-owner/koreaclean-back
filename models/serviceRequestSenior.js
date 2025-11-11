const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ServiceRequestSenior extends Model {}

  ServiceRequestSenior.init({
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
      comment: '신청-경로당 행 ID',
    },

    // FK → service_request.id
    service_request_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      comment: '서비스 신청 ID',
    },

    // (선택) FK → senior_center.id
    senior_center_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      comment: '마스터 경로당 ID',
    },

    // 스냅샷 정보 (마스터 변경과 무관하게 보존)
    name: {
      type: DataTypes.STRING(200),
      allowNull: false,
      comment: '경로당명',
    },
    address: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
      comment: '기본 주소',
    },
    address_detail: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
      comment: '상세 주소',
    },
    lat: { type: DataTypes.DECIMAL(12, 8), allowNull: true },
    lng: { type: DataTypes.DECIMAL(12, 8), allowNull: true },

    // 운영 측 작업 메모
    work_date: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: '',
      comment: '작업 예정일(YYYY-MM-DD)',
    },
    work: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      comment: '작업 내용/메모',
    },

    // 정렬/상태 등 확장 필드
    order_no: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: '표시 순서',
    },
    status: {
      type: DataTypes.ENUM('NEW', 'DONE', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'NEW',
      comment: '경로당 작업 상태',
    },
  }, {
    sequelize,
    tableName: 'service_request_senior',
    comment: '서비스신청별 선택 경로당(스냅샷)',
    timestamps: true,
    underscored: true,
    paranoid: true,
    indexes: [
      { fields: ['service_request_id'] },
      { fields: ['senior_center_id'] },
      { fields: ['status'] },
    ],
  });

  return ServiceRequestSenior;
};
