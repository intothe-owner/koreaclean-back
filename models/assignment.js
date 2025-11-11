const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {

  class Assignment extends Model { }
  Assignment.init({
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
      comment: '배정 ID (PK)',
    },
    // FK: 서비스신청
    service_request_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      comment: 'FK→service_request.id',
    },
    // FK: 업체
    company_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      comment: 'FK→company.id',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '배정 관련 비고/메모',
    },
    before_files: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '작업 전 사진'
    },
    after_files: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '작업 후 사진'
    },
    status: {
      type: DataTypes.ENUM('PENDING','ACCEPTED','IN_PROGRESS','DECLINED','CANCELLED'),
      allowNull: false,
      defaultValue: 'PENDING',
      comment: '배정상태: 응답대기/수락/진행중/거절/배정취소'
    },
    cancel_memo:{
      type:DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
      comment: '배정 취소 사유'
    }
  }, {
    sequelize,
    tableName: 'assignment',
    comment: '서비스 신청에 대한 업체 배정 내역',
    indexes: [
      { fields: ['status'] },
    ],
    timestamps: true,           // createdAt/updatedAt 사용
    underscored: false,         // ⬅️ 스네이크 끄기 (중요)
    createdAt: 'createdAt',     // ⬅️ 명시적으로 카멜
    updatedAt: 'updatedAt',
    paranoid: true,            // deletedAt 안 쓰면 false
  });

  return Assignment;
}