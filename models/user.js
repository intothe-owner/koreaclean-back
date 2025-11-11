const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class User extends Model { }
  User.init({
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
      comment: '사용자 ID (PK)',
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '이름',
    },
    inst: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '기관명',
    },
    email: {
      type: DataTypes.STRING(191),
      unique: true,
      validate: { isEmail: true },
      comment: '이메일 (로그인/연락용)',
    },
    contact: {
      type: DataTypes.STRING(50),
      comment: '사무실 연락처(기관회원만 적용)',
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING(50),
      comment: '휴대폰번호(담당자/대표자)',
      allowNull: true,
    },
    password_hash: {
      type: DataTypes.STRING(191),
      comment: '비밀번호 해시 (local provider만)',
    },
    role: {
      type: DataTypes.ENUM('SUPER', 'ADMIN', 'CLIENT', 'COMPANY'),
      allowNull: false,
      defaultValue: 'CLIENT',
      comment: '권한: 슈퍼/관리자/기관/업체',
    },
    provider: {
      type: DataTypes.ENUM('local', 'naver', 'kakao', 'google'),
      allowNull: false,
      defaultValue: 'local',
      comment: '로그인 제공자',
    },
    is_use:{
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'true 정상 false는 탈퇴',
    }
  }, {
    sequelize,
    tableName: 'user',
    comment: '시스템 사용자 (관리자, 기관고객, 업체담당자)',
    timestamps: true,           // createdAt/updatedAt 사용
    underscored: false,         // ⬅️ 스네이크 끄기 (중요)
    createdAt: 'createdAt',     // ⬅️ 명시적으로 카멜
    updatedAt: 'updatedAt',
    paranoid: true,            // deletedAt 안 쓰면 false
  });
  return User;
}