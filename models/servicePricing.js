// src/models/service_pricing.js
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class ServicePricing extends Model {
    static associate(models) {
      // 필요 시 관계 정의
    }
  }

  ServicePricing.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
        comment: "PK",
      },
      service_key: {
        type: DataTypes.ENUM(
          "airConditioner", "kitchen", "restroom", "acDeepClean"
        ),
        allowNull: false,
        comment: "서비스 종류 키",
      },
      price_krw: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: "가격(원, 정수)",
      },
    },
    {
      sequelize,
      tableName: "service_pricing",
      modelName: "ServicePricing",
      comment: "요금표(현재가 단일 저장)",
      timestamps: true,
      paranoid: true,         // deletedAt 사용
      underscored: false,     // createdAt/updatedAt 필드명 유지
      indexes: [
        { fields: ["service_key"] },
      ],
    }
  );

  return ServicePricing;
};
