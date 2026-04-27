// 创新实验知识图谱平台 — Neo4j 图模型骨架

// 创建约束（同时作为唯一索引）
CREATE CONSTRAINT IF NOT EXISTS FOR (c:Concept)    REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (e:Experiment) REQUIRE e.id IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (d:Document)   REQUIRE d.id IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (u:User)       REQUIRE u.id IS UNIQUE;

// 节点标签说明:
// Concept    — 知识概念节点
// Experiment — 实验节点
// Document   — 文档节点
// User       — 用户节点

// 关系类型说明（后续按需使用）:
// (:Concept)-[:RELATED_TO]->(:Concept)     概念间关联
// (:Experiment)-[:INVOLVES]->(:Concept)     实验涉及概念
// (:Document)-[:DESCRIBES]->(:Concept)      文档描述概念
// (:User)-[:CREATED]->(:Experiment)         用户创建实验
// (:User)-[:UPLOADED]->(:Document)          用户上传文档
// (:User)-[:CONTRIBUTED_TO]->(:Concept)     用户贡献知识
