const API_BASE = "/api/v1";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function request<T>(path: string, method: Method = "GET", body?: unknown): Promise<T> {
  const headers: HeadersInit = {};
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || res.statusText);
  }
  return res.json();
}

// ---------- Auth ----------

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export function register(username: string, email: string, password: string) {
  return request<TokenResponse>("/users/register", "POST", { username, email, password });
}

export function login(username: string, password: string) {
  return request<TokenResponse>("/users/login", "POST", { username, password });
}

// ---------- User ----------

export interface UserProfile {
  id: string;
  display_id: number | null;
  username: string;
  email: string;
  nickname: string | null;
  avatar: string | null;
  role: string;
  level: number;
  points: number;
  is_active: boolean;
  created_at: string;
}

export function getProfile() {
  return request<UserProfile>("/users/me");
}

export function updateProfile(data: { nickname?: string; avatar?: string }) {
  return request<UserProfile>("/users/me", "PATCH", data);
}

// ---------- Documents ----------

export interface DocumentItem {
  id: string;
  title: string;
  file_type: string;
  file_size: number;
  status: "uploaded" | "pending_review" | "parsing" | "extracting" | "awaiting_confirmation" | "completed" | "failed";
  experiment_year: number | null;
  experiment_type: string | null;
  subjects: string[] | null;
  privacy: string;
  visible_teams: string[] | null;
  extraction_result: {
    entity_count?: number;
    relation_count?: number;
    entities?: { id: string; type: string; name: string; summary: string }[];
    relations?: { source_id: string; target_id: string; type: string; confidence: number }[];
    duplicate_warnings?: {
      new_name: string;
      existing_name: string;
      existing_id: string;
      similarity: number;
      is_exact: boolean;
    }[];
  } | null;
  error_message: string | null;
  duplicate_info: {
    new_name: string;
    existing_name: string;
    existing_id: string;
    similarity: number;
    is_exact: boolean;
  }[] | null;
  uploaded_by: string;
  uploader_nickname?: string;
  uploader_username?: string;
  created_at: string;
}

export interface DocumentListResponse {
  total: number;
  items: DocumentItem[];
}

export interface BatchUploadResponse {
  documents: DocumentItem[];
  errors: { filename: string; error: string }[];
}

export function listDocuments(page = 1, pageSize = 20) {
  return request<DocumentListResponse>(`/documents/list?page=${page}&page_size=${pageSize}`);
}

export function uploadDocument(
  file: File,
  meta: {
    experiment_year?: number;
    experiment_type?: string;
    subjects?: string[];
    privacy?: string;
    visible_teams?: string[];
  },
) {
  const form = new FormData();
  form.append("file", file);
  if (meta.experiment_year) form.append("experiment_year", String(meta.experiment_year));
  if (meta.experiment_type) form.append("experiment_type", meta.experiment_type);
  if (meta.subjects?.length) form.append("subjects", JSON.stringify(meta.subjects));
  if (meta.privacy) form.append("privacy", meta.privacy);
  if (meta.visible_teams?.length) form.append("visible_teams", JSON.stringify(meta.visible_teams));
  return request<DocumentItem>("/documents/upload", "POST", form);
}

export function uploadBatch(
  files: File[],
  meta: {
    experiment_year?: number;
    experiment_type?: string;
    subjects?: string[];
    privacy?: string;
    visible_teams?: string[];
  },
) {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  if (meta.experiment_year) form.append("experiment_year", String(meta.experiment_year));
  if (meta.experiment_type) form.append("experiment_type", meta.experiment_type);
  if (meta.subjects?.length) form.append("subjects", JSON.stringify(meta.subjects));
  if (meta.privacy) form.append("privacy", meta.privacy);
  if (meta.visible_teams?.length) form.append("visible_teams", JSON.stringify(meta.visible_teams));
  return request<BatchUploadResponse>("/documents/upload-batch", "POST", form);
}

export function getDocumentStatus(docId: string) {
  return request<DocumentItem>(`/documents/${docId}/status`);
}

export function reprocessDocument(docId: string) {
  return request<DocumentItem>(`/documents/${docId}/reprocess`, "POST");
}

export function confirmIngest(docId: string, action: "overwrite" | "cancel" | "coexist") {
  return request<DocumentItem>(`/documents/${docId}/confirm-ingest`, "POST", { action });
}

export function deleteDocument(docId: string) {
  return request<void>(`/documents/${docId}`, "DELETE");
}

export async function downloadDocument(docId: string, filename: string) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE}/documents/${docId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("下载失败");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function getDocumentPreviewBlob(docId: string): Promise<string> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE}/documents/${docId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("预览失败");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// ========== Admin APIs ==========

export function adminListUsers(page = 1, pageSize = 50, search?: string, role?: string, isActive?: boolean) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  if (search) params.set("search", search);
  if (role) params.set("role", role);
  if (isActive !== undefined) params.set("is_active", String(isActive));
  return request<{ total: number; items: UserProfile[] }>(`/admin/users?${params}`);
}

export function adminUpdateUser(userId: string, data: Partial<UserProfile & { role?: string; is_active?: boolean; password?: string }>) {
  return request<UserProfile>(`/admin/users/${userId}`, "PATCH", data);
}

export function adminCreateUser(data: { username: string; email: string; password: string; nickname?: string; role?: string }) {
  return request<UserProfile>("/admin/users", "POST", data);
}

export function adminDeleteUser(userId: string) {
  return request<void>(`/admin/users/${userId}`, "DELETE");
}

export function adminAdjustPoints(userId: string, change: number, reason: string) {
  return request<UserProfile>(`/admin/users/${userId}/points`, "POST", { change, reason });
}

// Documents
export function adminListDocuments(page = 1, pageSize = 50, statusFilter?: string) {
  const params = `page=${page}&page_size=${pageSize}` + (statusFilter ? `&status=${statusFilter}` : "");
  return request<DocumentListResponse>(`/admin/documents?${params}`);
}

export function adminUpdateDocument(docId: string, data: Partial<DocumentItem & { extraction_result?: Record<string, unknown> }>) {
  return request<DocumentItem>(`/admin/documents/${docId}`, "PATCH", data);
}

export function adminDeleteDocument(docId: string) {
  return request<void>(`/admin/documents/${docId}`, "DELETE");
}

export function adminReprocessDocument(docId: string) {
  return request<DocumentItem>(`/documents/${docId}/reprocess`, "POST");
}

export function adminApproveDocument(docId: string) {
  return request<DocumentItem>(`/admin/documents/${docId}/approve`, "POST");
}

export function adminRejectDocument(docId: string) {
  return request<DocumentItem>(`/admin/documents/${docId}/reject`, "POST");
}

export function adminGetDocGraphData(docId: string) {
  return request<{ nodes: CytoscapeNode[]; relations: { data: { id: string; source: string; target: string; type: string; confidence: number } }[] }>(
    `/admin/documents/${docId}/graph-data`,
  );
}

// Knowledge Graph
export interface GraphNode {
  id: string;
  type: string;
  name: string;
  summary: string;
  document_id: string | null;
}

export interface GraphRelation {
  source_id: string;
  target_id: string;
  type: string;
  confidence: number;
  document_id: string | null;
}

export function adminListNodes(label?: string) {
  const params = label ? `?label=${label}` : "";
  return request<GraphNode[]>(`/admin/graph/nodes${params}`);
}

export function adminCreateNode(data: { type: string; name: string; summary?: string }) {
  return request<GraphNode>("/admin/graph/nodes", "POST", data);
}

export function adminUpdateNode(nodeId: string, data: Partial<GraphNode>) {
  return request<GraphNode>(`/admin/graph/nodes/${nodeId}`, "PATCH", data);
}

export function adminDeleteNode(nodeId: string) {
  return request<void>(`/admin/graph/nodes/${nodeId}`, "DELETE");
}

export function adminListRelations(nodeId?: string) {
  const params = nodeId ? `?node_id=${nodeId}` : "";
  return request<GraphRelation[]>(`/admin/graph/relations${params}`);
}

export function adminCreateRelation(data: { source_id: string; target_id: string; type: string; confidence?: number }) {
  return request<GraphRelation>("/admin/graph/relations", "POST", data);
}

export function adminDeleteRelation(sourceId: string, targetId: string, relType: string) {
  return request<void>(`/admin/graph/relations/${sourceId}/${targetId}/${relType}`, "DELETE");
}

export function adminGraphOverview() {
  return request<{ nodes: GraphNode[]; relations: GraphRelation[] }>("/admin/graph/data");
}

// AI Config
export interface AIConfigItem {
  key: string;
  value: string;
  updated_at: string | null;
}

export function getAIConfig() {
  return request<{ configs: AIConfigItem[] }>("/admin/ai-config");
}

export function updateAIConfig(configs: Record<string, string>) {
  return request<{ configs: AIConfigItem[] }>("/admin/ai-config", "PATCH", { configs });
}

// ========== Public Graph APIs ==========

export interface CytoscapeNode {
  data: {
    id: string;
    label: string;
    name: string;
    type: string;
    summary: string;
    document_id: string | null;
    color: string;
    size: number;
  };
}

export interface CytoscapeEdge {
  data: {
    id: string;
    source: string;
    target: string;
    type: string;
    confidence: number;
  };
}

export interface CytoscapeData {
  nodes: CytoscapeNode[];
  edges: CytoscapeEdge[];
}

export function getGraphData(nodeType?: string, keyword?: string, limit = 500, fromDate?: string, toDate?: string, years?: number[], scope?: string, teamId?: string) {
  const params = new URLSearchParams();
  if (nodeType) params.set("node_type", nodeType);
  if (keyword) params.set("keyword", keyword);
  params.set("limit", String(limit));
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  if (years && years.length > 0) params.set("years", years.join(","));
  if (scope) params.set("scope", scope);
  if (teamId) params.set("team_id", teamId);
  return request<CytoscapeData>(`/graph/data?${params}`);
}

export function getGraphYears(scope?: string, teamId?: string) {
  const params = new URLSearchParams();
  if (scope) params.set("scope", scope);
  if (teamId) params.set("team_id", teamId);
  const q = params.toString() ? `?${params.toString()}` : "";
  return request<{ years: number[] }>(`/graph/years${q}`);
}

export function cleanupOrphanedNodes() {
  return request<{ removed_experiments: number; removed_isolated: number; total: number }>(
    "/graph/cleanup/orphans",
    "POST",
  );
}

export interface TimelineEntry {
  year: number | null;
  node: { id: string; name: string; type: string; summary: string; color: string };
}

export function getTimelineData(scope?: string, teamId?: string) {
  const params = new URLSearchParams();
  if (scope) params.set("scope", scope);
  if (teamId) params.set("team_id", teamId);
  const q = params.toString() ? `?${params.toString()}` : "";
  return request<TimelineEntry[]>(`/graph/timeline${q}`);
}

export interface MatrixEntry {
  row_type: string;
  col_type: string;
  relation: string;
  count: number;
}

export function getMatrixData(scope?: string, teamId?: string) {
  const params = new URLSearchParams();
  if (scope) params.set("scope", scope);
  if (teamId) params.set("team_id", teamId);
  const q = params.toString() ? `?${params.toString()}` : "";
  return request<MatrixEntry[]>(`/graph/matrix${q}`);
}

// ========== Workbench APIs ==========

export interface DocTreeNode {
  [year: string]: {
    [type: string]: { id: string; title: string; file_type: string; status: string }[];
  };
}

export function getDocTree() {
  return request<DocTreeNode>("/workbench/tree");
}

export interface CardItem {
  id: string;
  title: string;
  file_type: string;
  file_size: number;
  file_path: string;
  status: string;
  experiment_year: number | null;
  experiment_type: string | null;
  subjects: string[] | null;
  privacy: string;
  ai_summary: string;
  entities: { id: string; type: string; name: string; summary: string }[];
  relations: { source_id: string; target_id: string; type: string; confidence: number }[];
  extraction_result: Record<string, unknown> | null;
  is_favorite: boolean;
  created_at: string | null;
}

export interface CardStreamResponse {
  total: number;
  cards: CardItem[];
}

export function getCardStream(params?: { year?: number; experiment_type?: string; favorite_only?: boolean; page?: number }) {
  const qs = new URLSearchParams();
  if (params?.year) qs.set("year", String(params.year));
  if (params?.experiment_type) qs.set("experiment_type", params.experiment_type);
  if (params?.favorite_only) qs.set("favorite_only", "true");
  if (params?.page) qs.set("page", String(params.page));
  const query = qs.toString();
  return request<CardStreamResponse>(`/workbench/cards${query ? `?${query}` : ""}`);
}

export function toggleFavorite(docId: string) {
  return request<{ is_favorite: boolean }>(`/workbench/favorites/${docId}`, "POST");
}

// ========== Insights ==========

export interface InsightEvent {
  type: string;
  id: string;
  significance: number;
  title: string;
  description: string;
  message: string;
  nodes: string[];
  experiments: { id: string; name: string }[];
  shared_entity?: { id: string; name: string; summary?: string; type?: string };
  confidence?: number;
}

export function discoverInsights() {
  return request<{ insights: InsightEvent[]; total: number }>("/insights/discover");
}

// ========== Templates & Growth ==========

export interface TemplateItem {
  id: string;
  name: string;
  description: string | null;
  tags: string[] | null;
  category: string | null;
  status: string;
  is_official: boolean;
  likes: number;
  downloads: number;
  adoptions: number;
  bookmarks: number;
  is_liked: boolean;
  created_by: string;
  created_at: string;
}

export function browseTemplates(params?: { keyword?: string; category?: string; sort?: string; page?: number }) {
  const qs = new URLSearchParams();
  if (params?.keyword) qs.set("keyword", params.keyword);
  if (params?.category) qs.set("category", params.category);
  if (params?.sort) qs.set("sort", params.sort);
  if (params?.page) qs.set("page", String(params.page));
  return request<{ total: number; items: TemplateItem[] }>(`/templates/market?${qs}`);
}

export function getTemplate(id: string) {
  return request<TemplateItem & { content: string; status: string; comments: { id: string; user_id: string; content: string; created_at: string }[] }>(`/templates/${id}`);
}

export function createTemplate(data: { name: string; description?: string; content: string; tags?: string[]; category?: string }) {
  return request<{ id: string; status: string }>("/templates/", "POST", data);
}

export function updateTemplate(id: string, data: Record<string, unknown>) {
  return request<{ status: string }>(`/templates/${id}`, "PATCH", data);
}

export function deleteTemplate(id: string) {
  return request<void>(`/templates/${id}`, "DELETE");
}

export function publishTemplate(id: string) {
  return request<{ status: string }>(`/templates/${id}/publish`, "POST");
}

export function toggleTemplateLike(id: string) {
  return request<{ is_liked: boolean; likes: number }>(`/templates/${id}/like`, "POST");
}

export function adoptTemplate(id: string) {
  return request<{ status: string; adoptions: number }>(`/templates/${id}/adopt`, "POST");
}

export function bookmarkTemplate(id: string) {
  return request<{ status: string; bookmarks: number }>(`/templates/${id}/bookmark`, "POST");
}

export function addTemplateComment(id: string, content: string) {
  return request<{ id: string; content: string; created_at: string }>(`/templates/${id}/comments`, "POST", { content });
}

// Admin Templates
export function adminListTemplates(page = 1, pageSize = 50, statusFilter?: string) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  if (statusFilter) params.set("status", statusFilter);
  return request<{ total: number; items: TemplateItem[] }>(`/admin/templates?${params}`);
}

export function adminUpdateTemplate(id: string, data: Record<string, unknown>) {
  return request<{ status: string }>(`/admin/templates/${id}`, "PATCH", data);
}

export function adminDeleteTemplate(id: string) {
  return request<void>(`/admin/templates/${id}`, "DELETE");
}

// Growth
export interface GrowthInfo {
  user_id: string;
  nickname: string;
  avatar: string | null;
  points: number;
  level: {
    level: number;
    title: string;
    icon: string;
    frame: string;
    points: number;
    next_level_points: number | null;
    progress: number;
  };
  points_rules: Record<string, number>;
  level_config: { level: number; title: string; icon: string; points: number; frame: string }[];
  recent_points: { change: number; reason: string; created_at: string }[];
}

export function getMyGrowth() {
  return request<GrowthInfo>("/templates/growth/me");
}

// ========== Natural Language Query ==========

export interface QueryResult {
  answer: string;
  highlighted_nodes: string[];
  source_documents: { id: string; title: string; relevance: number }[];
  suggestions: string[];
  related_queries: string[];
  entities: { id: string; name: string; type: string; summary: string; document_id?: string }[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function naturalLanguageQuery(question: string, history: ChatMessage[] = []) {
  return request<QueryResult>("/query", "POST", { question, history });
}

export function suggestRelations(nodeId: string) {
  return request<{ suggestions: { source_id: string; target_id: string; target_name?: string; type: string; confidence: number; reason: string }[] }>("/graph/suggest-relations", "POST", { node_id: nodeId });
}

// ========== Graph Edit (public) ==========

export function createGraphNode(data: { type: string; name: string; summary?: string }) {
  return request<GraphNode>("/graph/nodes", "POST", data);
}

export function createGraphRelation(data: { source_id: string; target_id: string; type: string; confidence?: number }) {
  return request<GraphRelation>("/graph/relations", "POST", data);
}

// ========== Dashboard ==========

export interface QuotaInfo {
  allowed: boolean;
  remaining: number;
  limit: number;
  unlimited: boolean;
}

export interface DashboardData {
  user: {
    id: string;
    username: string;
    nickname: string | null;
    avatar: string | null;
    level: number;
    points: number;
  };
  stats: {
    document_count: number;
    template_count: number;
    points: number;
    level: number;
  };
  quota?: {
    query: QuotaInfo;
    upload: QuotaInfo;
  };
  recent_documents: {
    id: string;
    title: string;
    status: string;
    created_at: string;
  }[];
  recent_points: {
    change: number;
    reason: string;
    created_at: string;
  }[];
}

export function getDashboard() {
  return request<DashboardData>("/users/me/dashboard");
}

// ========== Teams ==========

export interface TeamInfo {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  owner_nickname: string;
  member_count: number;
  created_at: string;
}

export interface TeamDetail extends TeamInfo {
  members: {
    user_id: string;
    display_id: number | null;
    username: string;
    nickname: string;
    avatar: string | null;
    role: string;
    joined_at: string;
  }[];
}

export function createTeam(data: { name: string; description?: string }) {
  return request<TeamInfo>("/teams/create", "POST", data);
}

export function getMyTeams() {
  return request<TeamInfo[]>("/teams/my");
}

export function getTeam(teamId: string) {
  return request<TeamDetail>(`/teams/${teamId}`);
}

export function inviteToTeam(teamId: string, usernameOrDisplayId?: string | number) {
  const body = usernameOrDisplayId ? (typeof usernameOrDisplayId === 'number' ? { display_id: usernameOrDisplayId } : { username: usernameOrDisplayId }) : {};
  return request<{ status: string; message: string }>(`/teams/${teamId}/invite`, "POST", body);
}

export function leaveTeam(teamId: string) {
  return request<{ status: string; message: string }>(`/teams/${teamId}/leave`, "POST");
}

export function deleteTeam(teamId: string) {
  return request<{ status: string; message: string }>(`/teams/${teamId}`, "DELETE");
}

export function searchUsers(keyword: string) {
  return request<{ id: string; username: string; nickname: string; avatar: string | null }[]>(`/teams/search/users?keyword=${encodeURIComponent(keyword)}`);
}

// ========== Team Chat ==========

export interface ChatMessageItem {
  id: string;
  team_id: string;
  user_id: string;
  nickname: string;
  avatar: string | null;
  message_type: "text" | "system";
  content: string;
  created_at: string;
}

export interface ChatHistoryResponse {
  total: number;
  page: number;
  page_size: number;
  items: ChatMessageItem[];
}

export function getTeamMessages(teamId: string, page = 1, pageSize = 50) {
  return request<ChatHistoryResponse>(`/teams/${teamId}/messages?page=${page}&page_size=${pageSize}`);
}

export function getRecentMessages(teamId: string, limit = 50) {
  return request<{ items: ChatMessageItem[] }>(`/teams/${teamId}/messages/recent?limit=${limit}`);
}

export function createTeamChatWS(teamId: string): WebSocket {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";
  const base = API_BASE.replace(/^http/, "ws");
  return new WebSocket(`${base}/ws/team/${teamId}?token=${token}`);
}

// ========== Team Growth ==========

export interface GrowthTimelineEntry {
  date: string | null;
  type: "document" | "achievement";
  user_id: string;
  user_nickname: string;
  title: string;
  details: string;
  achievement_type?: string;
}

export interface GrowthTimelineResponse {
  timeline: GrowthTimelineEntry[];
  summary: {
    total_documents: number;
    total_achievements: number;
    unique_entities: number;
    members: {
      user_id: string;
      nickname: string;
      document_count: number;
      achievement_count: number;
    }[];
  };
}

export interface AIGrowthAnalysis {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  score: number;
  quota: { remaining: number; limit: number };
}

export function getTeamGrowth(teamId: string) {
  return request<GrowthTimelineResponse>(`/teams/${teamId}/growth`);
}

export function requestAIGrowthAnalysis(teamId: string) {
  return request<AIGrowthAnalysis>(`/teams/${teamId}/ai-growth-analysis`, "POST");
}

// ========== Graph Tree ==========

export interface TreeNode {
  id: string;
  name: string;
  type: string;
  summary: string;
  children: TreeNode[];
}

export interface TreeData {
  root: TreeNode;
}

export function getTreeData(rootId: string, targetType?: string) {
  const params = new URLSearchParams({ root_id: rootId });
  if (targetType) params.set("target_type", targetType);
  return request<TreeData>(`/graph/tree?${params}`);
}

export function searchGraphNodes(q: string, nodeType?: string, limit = 20, scope?: string, teamId?: string) {
  const params = new URLSearchParams({ q, limit: String(limit) });
  if (nodeType) params.set("node_type", nodeType);
  if (scope) params.set("scope", scope);
  if (teamId) params.set("team_id", teamId);
  return request<{ nodes: GraphNode[] }>(`/graph/search?${params}`);
}

export function getNodeContext(nodeId: string) {
  return request<{ accessible: boolean; scope: string; node: { id: string; name: string; type: string; summary: string; document_id: string | null; created_by: string | null } }>(`/graph/node/${nodeId}/context`);
}

// ========== Forum ==========

export interface ForumBoard {
  slug: string;
  name: string;
  icon: string;
  description: string;
  color: string;
  thread_count: number;
}

export interface ForumThread {
  id: string;
  board: string;
  sub_board: string | null;
  post_type: string;
  title: string;
  content: string;
  tags: string[] | null;
  graph_node_ids: string[] | null;
  status: string;
  is_featured: boolean;
  reply_count: number;
  like_count: number;
  view_count: number;
  created_by: string;
  author_nickname: string;
  author_avatar: string | null;
  author_level: number;
  created_at: string;
  updated_at: string;
  is_liked: boolean;
  is_bookmarked: boolean;
}

export interface ForumReply {
  id: string;
  thread_id: string;
  parent_id: string | null;
  content: string;
  graph_node_ids: string[] | null;
  is_best_answer: boolean;
  like_count: number;
  created_by: string;
  author_nickname: string;
  author_avatar: string | null;
  author_level: number;
  created_at: string;
  updated_at: string;
  is_liked: boolean;
}

export interface ForumThreadListResponse {
  total: number;
  page: number;
  page_size: number;
  items: ForumThread[];
}

export interface ForumThreadDetailResponse {
  thread: ForumThread;
  replies: ForumReply[];
}

export function listForumBoards() {
  return request<{ boards: ForumBoard[] }>("/forum/boards");
}

export function listForumThreads(params: {
  board?: string;
  post_type?: string;
  sort?: string;
  keyword?: string;
  page?: number;
  page_size?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (params.board) qs.set("board", params.board);
  if (params.post_type) qs.set("post_type", params.post_type);
  if (params.sort) qs.set("sort", params.sort);
  if (params.keyword) qs.set("keyword", params.keyword);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const q = qs.toString() ? `?${qs.toString()}` : "";
  return request<ForumThreadListResponse>(`/forum/threads${q}`);
}

export function getForumThread(id: string) {
  return request<ForumThreadDetailResponse>(`/forum/threads/${id}`);
}

export function createForumThread(data: {
  board: string;
  sub_board?: string;
  post_type?: string;
  title: string;
  content: string;
  tags?: string[];
  graph_node_ids?: string[];
}) {
  return request<{ id: string; points_earned: number; new_level: number }>("/forum/threads", "POST", data);
}

export function updateForumThread(id: string, data: { title?: string; content?: string; tags?: string[] }) {
  return request<{ status: string }>(`/forum/threads/${id}`, "PATCH", data);
}

export function deleteForumThread(id: string) {
  return request<void>(`/forum/threads/${id}`, "DELETE");
}

export function toggleThreadLike(id: string) {
  return request<{ is_liked: boolean; like_count: number }>(`/forum/threads/${id}/like`, "POST");
}

export function toggleThreadBookmark(id: string) {
  return request<{ is_bookmarked: boolean }>(`/forum/threads/${id}/bookmark`, "POST");
}

export function createForumReply(threadId: string, data: { content: string; parent_id?: string; graph_node_ids?: string[] }) {
  return request<{ id: string; content: string; created_at: string; points_earned: number; new_level: number }>(`/forum/threads/${threadId}/reply`, "POST", data);
}

export function toggleReplyLike(replyId: string) {
  return request<{ is_liked: boolean; like_count: number }>(`/forum/replies/${replyId}/like`, "POST");
}

export function changeThreadStatus(threadId: string, status: string) {
  return request<{ status: string; is_featured: boolean }>(`/forum/threads/${threadId}/status?status=${status}`, "PATCH");
}

export function markBestAnswer(threadId: string, replyId: string) {
  return request<{ status: string }>(`/forum/threads/${threadId}/best-answer/${replyId}`, "POST");
}

export function getMyForumThreads(page = 1) {
  return request<ForumThreadListResponse>(`/forum/me/threads?page=${page}`);
}

export function getMyForumBookmarks(page = 1) {
  return request<ForumThreadListResponse>(`/forum/me/bookmarks?page=${page}`);
}

// ========== Equipment Requests ==========

export interface EquipmentCatalogItem {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string | null;
}

export interface EquipmentRequestItem {
  id: string;
  user_id: string;
  user_nickname: string | null;
  request_type: string;
  title: string;
  description: string | null;
  quantity: number;
  status: string;
  admin_reply: string | null;
  created_at: string | null;
}

export function getEquipmentCatalog() {
  return request<{ items: EquipmentCatalogItem[] }>("/equipment/catalog", "POST");
}

export function getAllCatalogItems() {
  return request<{ items: EquipmentCatalogItem[] }>("/equipment/catalog/all");
}

export function createCatalogItem(data: { name: string; icon: string; description: string; sort_order: number }) {
  return request<EquipmentCatalogItem>("/equipment/admin/catalog", "POST", data);
}

export function updateCatalogItem(id: string, data: { name?: string; icon?: string; description?: string; sort_order?: number; is_active?: boolean }) {
  return request<EquipmentCatalogItem>(`/equipment/admin/catalog/${id}`, "PUT", data);
}

export function deleteCatalogItem(id: string) {
  return request<{ message: string }>(`/equipment/admin/catalog/${id}`, "DELETE");
}

export function submitEquipmentRequest(data: {
  request_type: string;
  title: string;
  description?: string;
  quantity?: number;
}) {
  return request<{ id: string; message: string }>("/equipment/requests", "POST", data);
}

export function getMyEquipmentRequests(page = 1) {
  return request<{ total: number; items: EquipmentRequestItem[] }>(
    `/equipment/requests/my?page=${page}`
  );
}

export function adminListEquipmentRequests(page = 1, status?: string) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (status) params.set("status", status);
  return request<{ total: number; items: EquipmentRequestItem[] }>(
    `/equipment/admin/requests?${params.toString()}`
  );
}

export function adminReplyEquipmentRequest(id: string, data: { status: string; reply: string }) {
  return request<EquipmentRequestItem>(`/equipment/admin/requests/${id}`, "PATCH", data);
}
