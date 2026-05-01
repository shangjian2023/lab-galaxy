-- 创新实验知识图谱平台 — PostgreSQL 骨架

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 用户表
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username        VARCHAR(50) NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    nickname        VARCHAR(100),
    avatar          VARCHAR(500),
    role            VARCHAR(20) DEFAULT 'user',
    level           INTEGER DEFAULT 1,
    is_active       BOOLEAN DEFAULT TRUE,
    points          INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 模板状态枚举
CREATE TYPE tpl_status AS ENUM ('draft', 'pending_review', 'published', 'rejected');

-- 模板表
CREATE TABLE templates (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    content     TEXT NOT NULL,
    tags        VARCHAR(50)[],
    category    VARCHAR(50),
    status      tpl_status DEFAULT 'draft',
    is_official BOOLEAN DEFAULT FALSE,
    likes       INTEGER DEFAULT 0,
    downloads   INTEGER DEFAULT 0,
    adoptions   INTEGER DEFAULT 0,
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 模板评论
CREATE TABLE template_comments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES templates(id),
    user_id     UUID NOT NULL REFERENCES users(id),
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 模板点赞
CREATE TABLE template_likes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id),
    template_id UUID NOT NULL REFERENCES templates(id),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, template_id)
);

-- 文档状态枚举
CREATE TYPE doc_status AS ENUM ('uploaded', 'parsing', 'extracting', 'completed', 'failed');

-- 文档表
CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(255) NOT NULL,
    file_path       VARCHAR(500) NOT NULL,
    file_type       VARCHAR(20) NOT NULL,
    file_size       BIGINT DEFAULT 0,
    status          doc_status DEFAULT 'uploaded',
    experiment_year INTEGER,
    experiment_type VARCHAR(50),
    subjects        VARCHAR(100)[],
    privacy         VARCHAR(20) DEFAULT 'public',
    extraction_result TEXT,
    error_message   TEXT,
    uploaded_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 积分日志
CREATE TABLE points_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id),
    change      INTEGER NOT NULL,
    reason      VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 收藏表
CREATE TABLE favorites (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id),
    document_id UUID NOT NULL REFERENCES documents(id),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, document_id)
);

-- 索引
CREATE INDEX idx_templates_created_by ON templates(created_by);
CREATE INDEX idx_templates_status ON templates(status);
CREATE INDEX idx_templates_category ON templates(category);
CREATE INDEX idx_template_comments_template ON template_comments(template_id);
CREATE INDEX idx_template_likes_template ON template_likes(template_id);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_experiment_year ON documents(experiment_year);
CREATE INDEX idx_documents_experiment_type ON documents(experiment_type);
CREATE INDEX idx_points_log_user_id ON points_log(user_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_favorites_user_id ON favorites(user_id);

-- 初始管理员（密码: admin123）
INSERT INTO users (username, email, hashed_password, role, nickname)
VALUES (
    'admin',
    'admin@example.com',
    '$2b$12$Dm4pgNmLO0Pszk/YQZfXqOouW70c/2OBGzI8ssLczkxYpLebB0c.W',
    'admin',
    '管理员'
) ON CONFLICT (username) DO NOTHING;

-- 官方模板示例
INSERT INTO templates (name, description, content, tags, category, status, is_official)
VALUES (
    '课程实验报告模板',
    '标准课程实验报告结构，包含实验目的、原理、步骤、数据、结论',
    '{"sections":[{"title":"实验目的","placeholder":"描述实验目标"},{"title":"实验原理","placeholder":"相关理论与公式"},{"title":"实验设备与材料","placeholder":"列出设备和耗材"},{"title":"实验步骤","placeholder":"详细操作流程"},{"title":"数据记录与处理","placeholder":"实验数据表格"},{"title":"实验结果与分析","placeholder":"结果讨论"},{"title":"结论","placeholder":"实验总结"}]}',
    ARRAY['课程实验','报告','通用'],
    'course',
    'published',
    TRUE
),(
    '创新实验方案模板',
    '创新实验完整方案框架，含选题背景、技术路线、风险评估',
    '{"sections":[{"title":"选题背景与意义","placeholder":"研究动机"},{"title":"文献综述","placeholder":"相关工作"},{"title":"研究目标","placeholder":"具体目标"},{"title":"技术路线","placeholder":"实现路径"},{"title":"实验设计","placeholder":"方案细节"},{"title":"预期成果","placeholder":"交付物"},{"title":"风险评估","placeholder":"潜在问题与应对"},{"title":"时间计划","placeholder":"里程碑"}]}',
    ARRAY['创新实验','方案','竞赛'],
    'innovation',
    'published',
    TRUE
);
