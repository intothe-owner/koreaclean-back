const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
class Invoice extends Model {} 
Invoice.init({
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
    comment: '정산 ID (PK)',
  },
  amount: {
    type: DataTypes.DECIMAL(12,2),
    allowNull: false,
    comment: '청구/지급 금액',
  },
  currency: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'KRW',
    comment: '통화 (기본 KRW)',
  },
  tax_invoice_no: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '세금계산서 번호(선택)',
  },
  status: {
    // 'DRAFT'|'ISSUED'|'PAID'|'CANCELLED'
    type: DataTypes.ENUM('DRAFT','ISSUED','PAID','CANCELLED'),
    allowNull: false,
    defaultValue: 'DRAFT',
    comment: '정산 상태',
  },
  issued_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '정산서 발행일',
  },
  paid_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '지급(입금)일',
  },
  memo: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '정산 비고',
  },
}, {
  sequelize,
  tableName: 'invoice',
  comment: '정산(세금계산/지급) 내역',
  indexes: [
    { fields: ['status'] },
  ],
  timestamps: true,           // createdAt/updatedAt 사용
  underscored: false,         // ⬅️ 스네이크 끄기 (중요)
  createdAt: 'createdAt',     // ⬅️ 명시적으로 카멜
  updatedAt: 'updatedAt',
  paranoid: true,            // deletedAt 안 쓰면 false
});

return Invoice;
}