const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class SeniorCenter extends Model { }
  SeniorCenter.init({
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
      comment: '경로당 id(pk)',
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '경로당명',
    },
    address: {
      type: DataTypes.STRING(200),
      allowNull: false,
      comment: '기본주소',
    },
    address_detail: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: '상세주소',
    },
    post_code:{
      type: DataTypes.STRING(10),
      allowNull: true,
      comment: '우편번호',
    },
    lat: {
      type: DataTypes.DOUBLE,
      comment: '위도',
      allowNull: true
    },
    lng: {
      type: DataTypes.DOUBLE,
      comment: '경도',
      allowNull: true,
    }
  }, {
    sequelize,
    tableName: 'senior_center',
    comment: '경로당 정보',
    timestamps: true,           // createdAt/updatedAt 사용
    underscored: false,         // ⬅️ 스네이크 끄기 (중요)
    createdAt: 'createdAt',     // ⬅️ 명시적으로 카멜
    updatedAt: 'updatedAt',
    paranoid: true,            // deletedAt 안 쓰면 false
  });
  return SeniorCenter;
}