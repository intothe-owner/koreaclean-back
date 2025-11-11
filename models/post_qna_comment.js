// models/post_qna_comment.js
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PostQnaComment extends Model {}

  PostQnaComment.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        comment: 'QnA 댓글 ID (PK)',
      },
      post_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        comment: 'post_qna.id',
      },
      author_user_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        comment: '작성자 Users.id',
      },
      author_role: {
        type: DataTypes.ENUM('CLIENT', 'ADMIN', 'STAFF'),
        allowNull: true,
        comment: '작성자 역할(상태 전환용)',
      },
      body: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
        comment: '댓글 내용',
      },
    },
    {
      sequelize,
      tableName: 'post_qna_comment',
      comment: '문의하기 댓글',
      timestamps: true,
      paranoid: true,
      underscored: false,
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      deletedAt: 'deletedAt',
      charset: 'utf8mb4',
      collate: 'utf8mb4_general_ci',
      indexes: [
        { fields: ['post_id'] },
        { fields: ['author_user_id'] },
        { fields: ['createdAt'] },
      ],
    }
  );

  // (선택) 관계 설정은 models/index.js에서:
  // PostQna.hasMany(PostQnaComment, { foreignKey: 'post_id' });
  // PostQnaComment.belongsTo(PostQna, { foreignKey: 'post_id' });

  return PostQnaComment;
};
