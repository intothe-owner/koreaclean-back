// models/SiteInfo.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SiteInfo extends Model {
    // 필요하면 정적 메서드 추가 가능
  }

  SiteInfo.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        comment: 'PK',
      },

      /** 사이트명 (필수) */
      siteName: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '사이트명',
        validate: {
          notEmpty: { msg: '사이트명은 필수입니다.' },
          len: { args: [1, 100], msg: '사이트명은 1~100자' },
        },
      },

      /** 우편번호 */
      postCode: {
        type: DataTypes.STRING(10),
        allowNull: true,
        comment: '우편번호(5자리 등)',
        validate: {
          len: { args: [0, 10], msg: '우편번호는 최대 10자' },
        },
      },

      /** 기본주소 */
      address: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '기본주소',
      },

      /** 상세주소 */
      addressDetail: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '상세주소',
      },

      /** 사업자번호 (형식: 000-00-00000) */
      bizNo: {
        type: DataTypes.STRING(12),
        allowNull: true,
        comment: '사업자등록번호 (000-00-00000)',
        validate: {
          is: {
            args: [/^\d{3}-\d{2}-\d{5}$/],
            msg: '사업자번호 형식은 000-00-00000 입니다.',
          },
        },
      },

      /** 대표자명 */
      ceoName: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '대표명',
      },

      /** 전화번호 */
      tel: {
        type: DataTypes.STRING(30),
        allowNull: true,
        comment: '대표 전화번호',
      },

      /** 팩스번호 */
      fax: {
        type: DataTypes.STRING(30),
        allowNull: true,
        comment: '팩스번호',
      },

      /** 이메일 */
      email: {
        type: DataTypes.STRING(120),
        allowNull: true,
        comment: '관리자 이메일',
        set(v) {
          this.setDataValue('email', v ? String(v).trim().toLowerCase() : v);
        },
        validate: {
          isEmailOrEmpty(value) {
            if (!value) return;
            // Sequelize isEmail은 빈값 허용 안 해서 커스텀
            const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!re.test(value)) throw new Error('이메일 형식이 올바르지 않습니다.');
          },
        },
      },

      /** 이메일 공개 여부 */
      emailPublic: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '이메일 공개 여부',
      },
      site_description:{
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '사이트 설명',
      },
      meta_tags:{
        type: DataTypes.JSON,
        allowNull: true,
        comment: '사이트 메타 태그',
      },
      terms_text:{
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '사이트 이용약관',
      },
      privacy_text:{
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '사이트 개인정보처리방침',
      },


      /** 사이트 아이콘 URL (업로드 저장 후 경로) */
      iconUrl: {
        type: DataTypes.STRING(512),
        allowNull: true,
        comment: '사이트 아이콘 URL',
      },

      /** 스토리지 키(선택, S3 등) */
      iconKey: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '스토리지 오브젝트 키',
      },

      /** 타임스탬프(옵션에서 매핑) */
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'site_info',
      comment: '사이트 정보',
      timestamps: true,            // createdAt/updatedAt 사용
      underscored: false,          // 카멜케이스 컬럼
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      paranoid: true,              // deletedAt 소프트삭제
      indexes: [
        { fields: ['siteName'] },
        { fields: ['email'] },
      ],
      hooks: {
        beforeValidate: (instance) => {
          // 공백 트림
          [
            'siteName',
            'postCode',
            'address',
            'addressDetail',
            'bizNo',
            'ceoName',
            'tel',
            'fax',
          ].forEach((k) => {
            const v = instance[k];
            if (typeof v === 'string') instance[k] = v.trim();
          });
        },
      },
    }
  );

  return SiteInfo;
};
