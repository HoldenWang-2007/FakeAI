-- FakeAI 数据库初始化脚本
-- 在宝塔面板的 phpMyAdmin 中执行此 SQL

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 用户表
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `nickname` VARCHAR(64) NOT NULL COMMENT '用户昵称，唯一标识',
  `last_active` BIGINT NOT NULL DEFAULT 0 COMMENT '最后活跃时间戳',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`nickname`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 对话表
DROP TABLE IF EXISTS `conversations`;
CREATE TABLE `conversations` (
  `id` VARCHAR(128) NOT NULL COMMENT '对话ID',
  `nickname` VARCHAR(64) NOT NULL COMMENT '所属用户昵称',
  `title` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '对话标题',
  `created_at` BIGINT NOT NULL DEFAULT 0 COMMENT '创建时间戳',
  `updated_at` BIGINT NOT NULL DEFAULT 0 COMMENT '更新时间戳',
  PRIMARY KEY (`id`),
  KEY `idx_nickname` (`nickname`),
  KEY `idx_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='对话表';

-- 消息表
DROP TABLE IF EXISTS `messages`;
CREATE TABLE `messages` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '消息ID，自增',
  `conversation_id` VARCHAR(128) NOT NULL COMMENT '所属对话ID',
  `nickname` VARCHAR(64) NOT NULL COMMENT '所属用户昵称',
  `sender` VARCHAR(16) NOT NULL COMMENT '发送者：user / ai',
  `content` TEXT NOT NULL COMMENT '消息内容',
  `message_type` VARCHAR(16) NOT NULL DEFAULT 'text' COMMENT '消息类型：text / image',
  `image_data` MEDIUMTEXT NULL COMMENT '图片 base64 数据（message_type=image 时有效）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_conversation_id` (`conversation_id`),
  KEY `idx_nickname` (`nickname`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息表';

SET FOREIGN_KEY_CHECKS = 1;
