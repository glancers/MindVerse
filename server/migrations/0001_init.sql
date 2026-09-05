-- MindVerse v0.2 初始 schema：全部业务表带 user_id，多用户数据隔离
-- 幂等：启动时自动执行，全部 IF NOT EXISTS

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,           -- argon2
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS personas (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  name         TEXT NOT NULL,
  avatar       TEXT,                     -- 可空
  color        TEXT NOT NULL,
  tagline       TEXT,
  group_name    TEXT,                    -- 人格分组（空 = 不分组）
  traits        TEXT NOT NULL DEFAULT '[]',   -- JSON 数组
  system_prompt TEXT NOT NULL,
  model_binding TEXT,                    -- 可空 JSON：{providerId, model}
  is_preset    INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_personas_user ON personas(user_id, updated_at);

CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  type            TEXT NOT NULL,          -- 'private' | 'group'
  title           TEXT NOT NULL,
  persona_ids     TEXT NOT NULL,          -- JSON 数组
  host_persona_id TEXT,
  pinned          INTEGER NOT NULL DEFAULT 0,   -- 置顶
  folded          INTEGER NOT NULL DEFAULT 0,  -- 收进「折叠的聊天」
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at);

CREATE TABLE IF NOT EXISTS messages (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  conversation_id  TEXT NOT NULL,
  role             TEXT NOT NULL,         -- 'user' | 'assistant'
  sender_persona_id TEXT,
  content          TEXT NOT NULL,
  thinking         TEXT NOT NULL DEFAULT '',  -- 思考型模型的推理过程
  attachments      TEXT,                    -- 可空 JSON 数组：[{name, mime, size, kind, dataUrl?, text?}]
  created_at       INTEGER NOT NULL,
  status           TEXT NOT NULL          -- 'done' | 'streaming' | 'error' | 'stopped'
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(user_id, conversation_id, created_at);

CREATE TABLE IF NOT EXISTS providers (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  type          TEXT NOT NULL,            -- 'ark' | 'openai' | 'anthropic' | 'custom'
  name          TEXT NOT NULL,
  base_url      TEXT NOT NULL,
  api_key       TEXT NOT NULL,            -- 只存服务端，API 永不回传
  models        TEXT NOT NULL DEFAULT '[]',   -- JSON 数组
  default_model TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_providers_user ON providers(user_id);

CREATE TABLE IF NOT EXISTS settings (
  user_id            TEXT PRIMARY KEY REFERENCES users(id),
  active_provider_id TEXT NOT NULL DEFAULT '',
  active_model       TEXT NOT NULL DEFAULT '',
  default_rounds     INTEGER NOT NULL DEFAULT 3
);

CREATE TABLE IF NOT EXISTS favorites (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id),
  conversation_id     TEXT NOT NULL,         -- 来源会话（快照关联，无外键：会话删除后收藏保留）
  conversation_title  TEXT NOT NULL,         -- 来源标题快照
  items               TEXT NOT NULL,         -- JSON 数组：消息快照 [{messageId, role, senderPersonaId, senderName, content, createdAt}]
  created_at          INTEGER NOT NULL,
  last_used_at        INTEGER NOT NULL DEFAULT 0  -- 最近使用时间（查看/跳转来源时更新）
);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id, created_at);
