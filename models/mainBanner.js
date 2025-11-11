// models/main_banner.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class MainBanner extends Model {}

  MainBanner.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        comment: '배너 ID (PK)',
      },

      // 핵심
      image_url: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '배경 이미지 URL',
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '타이틀 텍스트',
      },
      subtitle: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '부제 텍스트',
      },
      link_url: {
        type: DataTypes.STRING(1000),
        allowNull: true,
        comment: '배너 클릭 이동 URL',
      },

      // 노출/정렬
      order_no: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 1,
        comment: '노출 순서 (1부터 오름차순)',
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '노출 여부',
      },

      // 오버레이 정렬/레이어
      alignX: {
        type: DataTypes.ENUM('left', 'center', 'right'),
        allowNull: false,
        defaultValue: 'left',
        comment: '가로 정렬',
      },
      alignY: {
        type: DataTypes.ENUM('top', 'middle', 'bottom'),
        allowNull: false,
        defaultValue: 'middle',
        comment: '세로 정렬',
      },
      textAlign: {
        type: DataTypes.ENUM('left', 'center', 'right'),
        allowNull: false,
        defaultValue: 'left',
        comment: '텍스트 정렬',
      },
      overlayZ: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10,
        comment: '오버레이 z-index',
      },

      // 폰트/텍스트 스타일
      titleSize: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 48,
        comment: '타이틀 폰트 크기(px)',
      },
      titleWeight: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 800,
        comment: '타이틀 폰트 굵기',
      },
      titleColor: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: '#111827',
        comment: '타이틀 색상(hex)',
      },
      subtitleSize: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 18,
        comment: '부제 폰트 크기(px)',
      },
      subtitleWeight: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 400,
        comment: '부제 폰트 굵기',
      },
      subtitleColor: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: '#4B5563',
        comment: '부제 색상(hex)',
      },
      fontFamily: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '폰트 패밀리 CSS 문자열',
      },

      // 카드(텍스트 박스) 스타일
      boxBg: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: '#FFFFFF',
        comment: '박스 배경색',
      },
      boxBlur: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '박스 배경 블러 여부',
      },
      boxOpacity: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0.7,
        comment: '박스 불투명도(0~1)',
      },
      boxRounded: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 20,
        comment: '박스 라운드(px)',
      },
      boxPaddingX: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 28,
        comment: '박스 패딩 X(px)',
      },
      boxPaddingY: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 24,
        comment: '박스 패딩 Y(px)',
      },
      boxShadow: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '박스 그림자 여부',
      },

      // 텍스트(오버레이) 애니메이션
      animType: {
        type: DataTypes.ENUM(
          'none',
          'fade',
          'slide-right',
          'slide-left',
          'slide-up',
          'slide-down',
          'zoom-in',
          'zoom-out',
          'kenburns'
        ),
        allowNull: false,
        defaultValue: 'fade',
        comment: '텍스트 박스 애니메이션 타입',
      },
      animDurationMs: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 900,
        comment: '텍스트 애니메이션 지속(ms)',
      },
      animDelayMs: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '텍스트 애니메이션 지연(ms)',
      },

      // 배경 이미지 애니메이션
      bgAnimType: {
        type: DataTypes.ENUM(
          'none',
          'fade',
          'slide-right',
          'slide-left',
          'slide-up',
          'slide-down',
          'zoom-in',
          'zoom-out',
          'kenburns'
        ),
        allowNull: false,
        defaultValue: 'kenburns',
        comment: '배경 이미지 애니메이션 타입',
      },
      bgAnimDurationMs: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 4000,
        comment: '배경 애니메이션 지속(ms)',
      },
      bgAnimDelayMs: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '배경 애니메이션 지연(ms)',
      },

      // 타임스탬프(옵션에서 timestamps 사용)
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '생성 시각',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '수정 시각',
      },
      // paranoid=false 이므로 deletedAt 미사용
    },
    {
      sequelize,
      tableName: 'main_banners',
      comment: '메인 배너(히어로) 설정',
      indexes: [
        { fields: ['is_active'] },
        { fields: ['order_no'] },
        { fields: ['createdAt'] },
      ],
      timestamps: true,      // createdAt/updatedAt
      underscored: false,    // 카멜케이스 컬럼 유지
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      paranoid: false,       // 소프트 삭제 미사용 (필요 시 true + deletedAt 추가)
    }
  );

  return MainBanner;
};
