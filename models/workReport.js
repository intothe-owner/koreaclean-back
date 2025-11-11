const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
class WorkReport extends Model {}
WorkReport.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  checklist: { type: DataTypes.JSON, allowNull: true },     // 체크 항목 진행 결과
  notes: { type: DataTypes.TEXT, allowNull: true },          // 특이사항
  photos: { type: DataTypes.JSON, allowNull: true },         // 사진 배열(JSON)
  attachments: { type: DataTypes.JSON, allowNull: true },    // 결과보고서 파일(JSON)
  completed_at: { type: DataTypes.DATE, allowNull: true },
}, {
  sequelize,
  tableName: 'work_report',
  timestamps: true,           // createdAt/updatedAt 사용
  underscored: false,         // ⬅️ 스네이크 끄기 (중요)
  createdAt: 'createdAt',     // ⬅️ 명시적으로 카멜
  updatedAt: 'updatedAt',
  paranoid: true,            // deletedAt 안 쓰면 false
});

return WorkReport;
}
