// src/models/serviceRequest.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ServiceRequest extends Model {}

  ServiceRequest.init({
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true, comment: '서비스 신청 ID (PK)' },
    client_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, comment: '신청자 사용자 ID (FK→user.id)' },
    org_name: { type: DataTypes.STRING(150), allowNull: false, comment: '기관명' },
    contact_name: { type: DataTypes.STRING(100), allowNull: false, comment: '담당자 이름' },
    contact_tel: { type: DataTypes.STRING(50), allowNull: false, comment: '담당자 사무실 연락처' },
    contact_phone: { type: DataTypes.STRING(50), allowNull: false, comment: '담당자 휴대폰' },
    contact_email: { type: DataTypes.STRING(191), allowNull: true, validate: { isEmail: true }, comment: '담당자 이메일' },
    seniors:{
      type:DataTypes.JSON,
      allowNull:false,
      comment:'경로당 정보'
    },
    service_type: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: "서비스 타입 문자열 배열",
      
    },
    service_types_other:{
      type: DataTypes.STRING(150), allowNull: true, comment: '기타 서비스'
    },
    hope_date: { type: DataTypes.DATE, allowNull: true, comment: '희망 일정' },
    etc: { type: DataTypes.TEXT, allowNull: true, comment: '요청 상세 설명' },
    files: { type: DataTypes.JSON, allowNull: true, comment: '첨부 파일 JSON 배열 [{name,path,size,mime,meta}]' },
    price:{
      type:DataTypes.INTEGER,
      allowNull: true,
      comment:'견적비용',
    },
    estimate:{
      type:DataTypes.JSON,
      allowNull: true,
      comment:'견적서',
    },
    status: {
      type: DataTypes.ENUM('WAIT','IN_PROGRESS','DONE','CANCELLED'),
      allowNull: false, defaultValue: 'WAIT', comment: '진행 상태'
    },
  }, {
    sequelize,
    tableName: 'service_request',
    comment: '기관의 서비스 신청 정보',
  });

  return ServiceRequest;
};
