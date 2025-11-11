const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
class Company extends Model {}
Company.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  name: { 
    type: DataTypes.STRING(150), 
    allowNull: false,
    comment:'기업명' 
  },
  ceo: { 
    type: DataTypes.STRING(150), 
    allowNull: false,
    comment:'대표자명' 
  },
  biz_no: { 
    type: DataTypes.STRING(20), 
    allowNull: false,
    comment:'사업자번호' 
  }, // 사업자등록번호
  corp_no:{ 
    type: DataTypes.STRING(20), 
    allowNull: true,
    comment:'법인번호' 
  },//법인번호
  start_date:{
    type:DataTypes.DATE,
    allowNull:true,
    comment:'설립일'
  },
  company_type:{
    type:DataTypes.ENUM('협동조합','유한회사','주식회사','개인사업자'),
    allowNull:true,
    comment:'설립일'
  },
  post_code:{
    type: DataTypes.STRING(7), 
    allowNull: false,
    comment:'우편번호'
  },
  address: { 
    type: DataTypes.STRING(255), 
    allowNull: false,
    comment:'회사주소'
  },
  address_detail: { 
    type: DataTypes.STRING(255), 
    allowNull: true,
    comment:'상세주소'
  },
  
  address_detail: { 
    type: DataTypes.STRING(255), 
    allowNull: true,
    comment:'상세주소'
  },
  lat: { 
    type: DataTypes.DOUBLE, 
    allowNull: true,
    comment:'위도'
  },
  lng: { 
    type: DataTypes.DOUBLE, 
    allowNull: true,
    comment:'경도'
  },
  tel: { 
    type: DataTypes.STRING(50), 
    allowNull: false,
    comment:'대표번호'
  },
  fax: { 
    type: DataTypes.STRING(50), 
    allowNull: true,
    comment:'팩스번호'
  },
  email: { 
    type: DataTypes.STRING(200), 
    allowNull: true,
    comment:'이메일주소'
  },
  homepage: { 
    type: DataTypes.STRING(200), 
    allowNull: true,
    comment:'홈페이지 주소'
  },
  regions: { 
    type: DataTypes.JSON, 
    allowNull: true,
    comment:'주력지역'
  },      // 서비스 가능 지역 배열
  certs: { 
    type: DataTypes.JSON, 
    allowNull: true,
    comment:'자격증/경력'
  },        // 자격증/경력 JSON
  documents: { 
    type: DataTypes.JSON, 
    allowNull: true,
    comment:''
 },    // 업로드 서류 JSON (파일경로/원본명/사이즈 등)
  status: { // 'PENDING' | 'APPROVED' | 'REJECTED'
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
}, {
  sequelize,
  tableName: 'company',
  indexes: [{ fields: ['status'] }, { fields: ['name'] }],
  timestamps: true,           // createdAt/updatedAt 사용
  underscored: false,         // ⬅️ 스네이크 끄기 (중요)
  createdAt: 'createdAt',     // ⬅️ 명시적으로 카멜
  updatedAt: 'updatedAt',
  paranoid: true,            // deletedAt 안 쓰면 false
});

return Company;
}
