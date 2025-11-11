const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class AfterService extends Model { }
  AfterService.init({
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
      comment: 'A/S ID (PK)',
    },
    reason: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'A/S 요청 사유(간단 요약)',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'A/S 상세 설명',
    },
    photos: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '현장 사진 JSON 배열 [{name,path,size,mime,meta}]',
    },
    status: {
      // 'REQUESTED' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED'
      type: DataTypes.ENUM('REQUESTED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'),
      allowNull: false,
      defaultValue: 'REQUESTED',
      comment: 'A/S 진행 상태',
    },
    requested_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'A/S 요청 시각',
    },
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'A/S 처리 완료 시각',
    },
  }, {
    sequelize,
    tableName: 'after_service',
    comment: 'A/S 요청 및 처리 내역',
    indexes: [
      {
        fields: ['status'],
        // MySQL은 인덱스 자체 코멘트는 지원 X (엔진마다 일부 차이)
      },
    ],
    timestamps: true,           // createdAt/updatedAt 사용
  underscored: false,         // ⬅️ 스네이크 끄기 (중요)
  createdAt: 'createdAt',     // ⬅️ 명시적으로 카멜
  updatedAt: 'updatedAt',
  paranoid: true,            // deletedAt 안 쓰면 false
  });
  return AfterService;
}
