const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

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
  status: "uploaded" | "parsing" | "extracting" | "awaiting_confirmation" | "completed" | "failed";
  experiment_year: number | null;
  experiment_type: string | null;
  subjects: string[] | null;
  privacy: string;
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
  },
) {
  const form = new FormData();
  form.append("file", file);
  if (meta.experiment_year) form.append("experiment_year", String(meta.experiment_year));
  if (meta.experiment_type) form.append("experiment_type", meta.experiment_type);
  if (meta.subjects?.length) form.append("subjects", JSON.stringify(meta.subjects));
  if (meta.privacy) form.append("privacy", meta.privacy);
  return request<DocumentItem>("/documents/upload", "POST", form);
}

export function uploadBatch(
  files: File[],
  meta: {
    experiment_year?: number;
    experiment_type?: string;
    subjects?: string[];
    privacy?: string;
  },
) {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  if (meta.experiment_year) form.append("experiment_year", String(meta.experiment_year));
  if (meta.experiment_type) form.append("experiment_type", meta.experiment_type);
  if (meta.subjects?.length) form.append("subjects", JSON.stringify(meta.subjects));
  if (meta.privacy) form.append("privacy", meta.privacy);
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

export function getGraphData(nodeType?: string, keyword?: string, limit = 500, fromDate?: string, toDate?: string) {
  const params = new URLSearchParams();
  if (nodeType) params.set("node_type", nodeType);
  if (keyword) params.set("keyword", keyword);
  params.set("limit", String(limit));
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  return request<CytoscapeData>(`/graph/data?${params}`);
}

export interface TimelineEntry {
  year: number | null;
  node: { id: string; name: string; type: string; summary: string; color: string };
}

export function getTimelineData() {
  return request<TimelineEntry[]>("/graph/timeline");
}

export interface MatrixEntry {
  row_type: string;
  col_type: string;
  relation: string;
  count: number;
}

export function getMatrixData() {
  return request<MatrixEntry[]>("/graph/matrix");
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

export function naturalLanguageQuery(question: string) {
  return request<QueryResult>("/query", "POST", { question });
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
