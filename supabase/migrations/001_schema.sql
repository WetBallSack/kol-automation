-- ============================================================
-- 001_schema.sql  –  小红书 KOL Automation (XHS only)
-- Run once in Supabase SQL Editor
-- ============================================================

-- Helper: auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- platform_config
CREATE TABLE IF NOT EXISTS platform_config (
  id                serial PRIMARY KEY,
  platform          text    NOT NULL DEFAULT 'xhs',
  enabled           bool    NOT NULL DEFAULT true,
  daily_post_limit  int     NOT NULL DEFAULT 1,
  system_prompt     text,
  banned_words      jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_platform_config_updated_at
  BEFORE UPDATE ON platform_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- topics
CREATE TABLE IF NOT EXISTS topics (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text        NOT NULL,
  platform   text        NOT NULL DEFAULT 'xhs',
  used       bool        NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_topics_used     ON topics (used);
CREATE INDEX IF NOT EXISTS idx_topics_platform ON topics (platform);

-- posts
CREATE TABLE IF NOT EXISTS posts (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform           text        NOT NULL DEFAULT 'xhs',
  topic_id           uuid        REFERENCES topics (id),
  title              text,
  body               text,
  hashtags           text[],
  topic_tag          text,
  slides             jsonb,
  cover_text         text,
  original_body      text,
  substitutions_log  jsonb,
  status             text        NOT NULL DEFAULT 'queued',
  xhs_post_id        text,
  xhs_post_url       text,
  retry_count        int         NOT NULL DEFAULT 0,
  error_message      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posts_status_check
    CHECK (status IN ('queued','ready','published','failed','banned'))
);

CREATE INDEX IF NOT EXISTS idx_posts_status     ON posts (status);
CREATE INDEX IF NOT EXISTS idx_posts_platform   ON posts (platform);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);

CREATE TRIGGER trg_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- analytics
CREATE TABLE IF NOT EXISTS analytics (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        uuid        REFERENCES posts (id),
  clicks         int         NOT NULL DEFAULT 0,
  signups        int         NOT NULL DEFAULT 0,
  commission_usd numeric     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- cron_logs
CREATE TABLE IF NOT EXISTS cron_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at           timestamptz NOT NULL DEFAULT now(),
  topic_used       text,
  posts_generated  int         NOT NULL DEFAULT 0,
  error_count      int         NOT NULL DEFAULT 0,
  duration_ms      int,
  notes            text
);

-- xhs_accounts
CREATE TABLE IF NOT EXISTS xhs_accounts (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  username         text        UNIQUE NOT NULL,
  cookies          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status           text        NOT NULL DEFAULT 'active',
  posts_today      int         NOT NULL DEFAULT 0,
  last_post_at     timestamptz,
  is_shadowbanned  bool        NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_xhs_accounts_updated_at
  BEFORE UPDATE ON xhs_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed: platform_config
INSERT INTO platform_config (platform, enabled, daily_post_limit, system_prompt, banned_words)
VALUES (
  'xhs', true, 1,
  '你是一位正在学习海外理财的年轻中国女性，用日记体风格在小红书分享自己的数字资产学习记录。语气亲切真实，像和闺蜜聊天。定位是"理财笔记"和"学习记录"，不是广告。

禁止使用以下词汇：币安、加密货币、交易所、注册链接、返佣、虚拟货币、炒币、挖矿、合约、杠杆、爆仓、割韭菜、庄家、空投、私钥、钱包地址、链上。

替换规则：币安→B平台，加密货币/虚拟货币→数字资产，交易所→平台，注册链接→资源链接，返佣→收益，炒币→学习理财，挖矿→节点参与，合约→衍生品学习，杠杆→放大机制，爆仓→风险事件，割韭菜→市场波动，庄家→大资金方，空投→平台奖励，私钥→资产密钥，钱包地址→资产地址，链上→网络层。

不得在正文中放任何链接。如需引导，只可以说一次"链接在主页"。

输出合法JSON：
{
  "title": "最多25字含emoji的吸引人标题",
  "body": "最多150字第一人称日记式开头",
  "hashtags": ["标签1","标签2","标签3","标签4","标签5"],
  "topic_tag": "#海外理财",
  "cover_text": "最多20字封面大字",
  "slides": [{"heading":"最多15字","body":"最多60字"}]
}
slides必须包含6到9个元素。',
  '{"币安":"B平台","加密货币":"数字资产","交易所":"平台","注册链接":"资源链接","返佣":"收益","炒币":"学习理财","挖矿":"节点参与","合约":"衍生品学习","杠杆":"放大机制","爆仓":"风险事件","割韭菜":"市场波动","庄家":"大资金方","空投":"平台奖励","私钥":"资产密钥","钱包地址":"资产地址","链上":"网络层"}'::jsonb
);

-- Seed: 10 topics
INSERT INTO topics (title, platform) VALUES
  ('第一次买数字资产是什么感觉', 'xhs'),
  ('海外理财入门，我踩过的坑', 'xhs'),
  ('普通人怎么开始做资产配置', 'xhs'),
  ('我的2024理财学习总结', 'xhs'),
  ('数字资产到底安不安全？我的真实体验', 'xhs'),
  ('为什么我开始关注海外平台', 'xhs'),
  ('月光族到有储蓄，我做了这3件事', 'xhs'),
  ('第一次体验节点参与是什么感觉', 'xhs'),
  ('理财小白的100天成长记录', 'xhs'),
  ('我为什么把部分资产放在海外', 'xhs');

-- Seed: placeholder XHS account
INSERT INTO xhs_accounts (username, cookies, status)
VALUES ('account_1', '{}'::jsonb, 'needs_login');

-- pg_cron: reset posts_today at midnight UTC
-- NOTE: Enable pg_cron extension first in Supabase Dashboard > Database > Extensions
SELECT cron.schedule(
  'reset-daily-post-counts',
  '0 0 * * *',
  $$UPDATE xhs_accounts SET posts_today = 0$$
);