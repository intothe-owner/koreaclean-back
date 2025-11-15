// src/models/index.js
const { Sequelize, DataTypes } = require('sequelize');
const env = process.env.NODE_ENV || 'development';
const config = require(__dirname + '/../config/config.json')[env];

const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    dialect: config.dialect,
    timezone: config.timezone,
    logging: (sql, timing) => console.log('[SQL]', sql),
    define: {
      underscored: true,
      paranoid: true,
      freezeTableName: true,
    },
  }
);

// ===== 기존 모델 로드 =====
const User                 = require('./user')(sequelize, DataTypes);
const Company              = require('./company')(sequelize, DataTypes);
const ServiceRequest       = require('./serviceRequest')(sequelize, DataTypes);
const ServiceRequestSenior = require('./serviceRequestSenior')(sequelize, DataTypes);
const SeniorCenter         = require('./seniorCenter')(sequelize, DataTypes);
const Assignment           = require('./assignment')(sequelize, DataTypes);
const SiteInfo             = require('./siteInfo')(sequelize, DataTypes);
const MainBanner           = require('./mainBanner')(sequelize, DataTypes);
const Notice               = require('./notice')(sequelize, DataTypes);
const ServicePricing       = require('./servicePricing')(sequelize, DataTypes);
const Faq                  = require('./faq')(sequelize, DataTypes);

// ✅ 신규: Review
const Review               = require('./review')(sequelize, DataTypes);

// ===== 신규: QnA =====
const PostQna              = require('./post_qna')(sequelize, DataTypes);
const PostQnaComment       = require('./post_qna_comment')(sequelize, DataTypes);

// ===== 신규: 채팅 =====
const ChatRoom             = require('./chat_room')(sequelize, DataTypes);
const ChatMember           = require('./chat_member')(sequelize, DataTypes);
const ChatMessage          = require('./chat_message')(sequelize, DataTypes);

// ===== 신규: 통계용 기업 + 서비스통계 =====
const StatCompany          = require('./statCompany')(sequelize, DataTypes);
const ServiceStat          = require('./ServiceStat')(sequelize, DataTypes);

// =================== Associations ===================

// 1) User ↔ Company
User.hasOne(Company, {
  foreignKey: { name: 'owner_user_id', allowNull: true },
  as: 'company',
});
Company.belongsTo(User, {
  foreignKey: { name: 'owner_user_id', allowNull: true },
  as: 'owner',
});

// 2) User(신청자) ↔ ServiceRequest
User.hasMany(ServiceRequest, {
  foreignKey: { name: 'client_id', allowNull: false },
  as: 'serviceRequests',
});
ServiceRequest.belongsTo(User, {
  foreignKey: { name: 'client_id', allowNull: false },
  as: 'creator',
});

// 3) User ↔ SeniorCenter
User.hasMany(SeniorCenter, {
  foreignKey: { name: 'client_id', allowNull: false },
  as: 'seniorCenters',
});
SeniorCenter.belongsTo(User, {
  foreignKey: { name: 'client_id', allowNull: false },
  as: 'users',
});

// 4) ServiceRequest ↔ Assignment
ServiceRequest.hasMany(Assignment, {
  foreignKey: { name: 'service_request_id', allowNull: false },
  as: 'assignment',
  onDelete: 'CASCADE',
});
Assignment.belongsTo(ServiceRequest, {
  foreignKey: { name: 'service_request_id', allowNull: false },
  as: 'serviceRequest',
});

// 5) Company ↔ Assignment
Company.hasMany(Assignment, {
  foreignKey: { name: 'company_id', allowNull: false },
  as: 'assignments',
});
Assignment.belongsTo(Company, {
  foreignKey: { name: 'company_id', allowNull: false },
  as: 'company',
});

// =================== QnA 관계 ===================
User.hasMany(PostQna, {
  foreignKey: { name: 'client_id', allowNull: false },
  as: 'qnaPosts',
});
PostQna.belongsTo(User, {
  foreignKey: { name: 'client_id', allowNull: false },
  as: 'author',
});

PostQna.hasMany(PostQnaComment, {
  foreignKey: { name: 'post_id', allowNull: false },
  as: 'comments',
  onDelete: 'CASCADE',
});
PostQnaComment.belongsTo(PostQna, {
  foreignKey: { name: 'post_id', allowNull: false },
  as: 'post',
});

User.hasMany(PostQnaComment, {
  foreignKey: { name: 'author_user_id', allowNull: true },
  as: 'qnaComments',
});
PostQnaComment.belongsTo(User, {
  foreignKey: { name: 'author_user_id', allowNull: true },
  as: 'commentAuthor',
});

// =================== Chat 관계 ===================

// ServiceRequest ↔ ChatRoom (1:1)
ServiceRequest.hasOne(ChatRoom, {
  foreignKey: { name: 'service_request_id', allowNull: false },
  as: 'chatRoom',
  onDelete: 'CASCADE',
});
ChatRoom.belongsTo(ServiceRequest, {
  foreignKey: { name: 'service_request_id', allowNull: false },
  as: 'serviceRequest',
});

// ChatRoom ↔ ChatMember (1:N)
ChatRoom.hasMany(ChatMember, {
  foreignKey: { name: 'room_id', allowNull: false },
  as: 'members',
  onDelete: 'CASCADE',
});
ChatMember.belongsTo(ChatRoom, {
  foreignKey: { name: 'room_id', allowNull: false },
  as: 'room',
});

// User ↔ ChatMember (1:N)
User.hasMany(ChatMember, {
  foreignKey: { name: 'user_id', allowNull: false },
  as: 'chatMemberships',
});
ChatMember.belongsTo(User, {
  foreignKey: { name: 'user_id', allowNull: false },
  as: 'user',
});

// ChatRoom ↔ ChatMessage (1:N)
ChatRoom.hasMany(ChatMessage, {
  foreignKey: { name: 'room_id', allowNull: false },
  as: 'messages',
  onDelete: 'CASCADE',
});
ChatMessage.belongsTo(ChatRoom, {
  foreignKey: { name: 'room_id', allowNull: false },
  as: 'room',
});

// User ↔ ChatMessage (1:N) : 발신자
User.hasMany(ChatMessage, {
  foreignKey: { name: 'sender_user_id', allowNull: false },
  as: 'sentMessages',
});
ChatMessage.belongsTo(User, {
  foreignKey: { name: 'sender_user_id', allowNull: false },
  as: 'sender',
});

// ServiceRequest ↔ ServiceRequestSenior (1:N)
ServiceRequest.hasMany(ServiceRequestSenior, {
  foreignKey: { name: 'service_request_id', allowNull: false },
  as: 'selectedSeniors',
  onDelete: 'CASCADE',
});
ServiceRequestSenior.belongsTo(ServiceRequest, {
  foreignKey: { name: 'service_request_id', allowNull: false },
  as: 'serviceRequest',
});

// SeniorCenter ↔ ServiceRequestSenior (1:N)
SeniorCenter.hasMany(ServiceRequestSenior, {
  foreignKey: { name: 'senior_center_id', allowNull: true },
  as: 'requestLinks',
});
ServiceRequestSenior.belongsTo(SeniorCenter, {
  foreignKey: { name: 'senior_center_id', allowNull: true },
  as: 'seniorCenter',
});

// =================== Stats 관계 ===================

// StatCompany ↔ ServiceStat (1:N)
StatCompany.hasMany(ServiceStat, {
  foreignKey: { name: 'company_id', allowNull: false },
  as: 'stats',
  onDelete: 'CASCADE',
});
ServiceStat.belongsTo(StatCompany, {
  foreignKey: { name: 'company_id', allowNull: false },
  as: 'company',
});

// =================== Export ===================
module.exports = {
  sequelize,
  Sequelize,

  User,
  Company,
  ServiceRequest,
  SeniorCenter,
  Assignment,
  SiteInfo,
  MainBanner,
  ServicePricing,
  ServiceRequestSenior,
  Notice,
  Faq,

  // QnA
  PostQna,
  PostQnaComment,

  // Chat
  ChatRoom,
  ChatMember,
  ChatMessage,

  // Review
  Review,

  // Stats
  StatCompany,
  ServiceStat,
};
