export type Effort = "low" | "medium" | "high" | "ultra";
export type Space = "study" | "dev";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  has_password: boolean;
  google_linked: boolean;
}

export interface Subject {
  id: string;
  name: string;
  description: string;
  emoji: string;
  emoji_source: "local" | "ai" | "fallback" | "manual";
  material_count: number;
  lab_count: number;
  labs_open: number;
  created_at: string;
  updated_at: string;
}

export interface EmojiSuggestion {
  emoji: string;
  source: "local" | "ai" | "fallback";
  category: string | null;
  alternatives: string[];
}

export type FileStatus = "uploaded" | "parsing" | "indexing" | "ready" | "failed";

export interface StoredFile {
  id: string;
  original_name: string;
  mime: string;
  size: number;
  status: FileStatus;
  error: string | null;
  chunk_count: number;
  subject_id: string | null;
  project_id: string | null;
  created_at: string;
}

export interface LabAnalysis {
  execution_difficulty: number;
  theory_difficulty: number;
  defense_difficulty: number;
  estimated_hours: number;
  summary: string;
  required_knowledge: string[];
  gaps: string[];
  recommendations: string[];
  defense_questions: string[];
}

export interface Lab {
  id: string;
  subject_id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done";
  file_id: string | null;
  analysis: LabAnalysis | null;
  analysis_request_id: string | null;
  analyzed_at: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  position: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  stack: string[];
  category_id: string | null;
  file_count: number;
  session_count: number;
  created_at: string;
  updated_at: string;
}

export interface ActivityItem {
  kind: "session" | "file" | "message";
  title: string;
  at: string;
  ref_id: string;
}

export interface ChatSession {
  id: string;
  space: Space;
  subject_id: string | null;
  project_id: string | null;
  title: string;
  model: string;
  effort: Effort;
  pinned: boolean;
  prompt_tokens: number;
  completion_tokens: number;
  created_at: string;
  updated_at: string;
}

export type MessageStatus = "streaming" | "complete" | "error" | "cancelled";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: MessageStatus;
  error: string | null;
  model: string | null;
  effort: Effort | null;
  request_id: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  created_at: string;
}

export type EventStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface AIEvent {
  request_id: string;
  event_id: string;
  seq: number;
  event_type: string;
  stage: string;
  status: EventStatus;
  title: string;
  description: string;
  timestamp: string;
  duration_ms: number | null;
  metadata: Record<string, string | number | boolean | null | string[]>;
}

export interface AIRequestLog {
  id: string;
  kind: string;
  status: "running" | "completed" | "failed" | "cancelled";
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  events: AIEvent[];
}

export interface ModelInfo {
  id: string;
  label: string;
  provider: string;
  capabilities: string[];
  supports_streaming: boolean;
  supports_reasoning: boolean;
  efforts: Effort[];
  context_window: number | null;
  verified: boolean;
  note: string | null;
}

export interface Usage {
  today_tokens: number;
  daily_limit: number;
  ai_configured: boolean;
  provider: "nvidia" | "mock" | "none";
}

export interface Question {
  id: string;
  idx: number;
  kind: "choice" | "open";
  topic: string;
  difficulty: string;
  prompt: string;
  options: string[] | null;
  user_answer: string | null;
  score: number | null;
  feedback: string | null;
  grading_request_id: string | null;
  correct_index: number | null;
  explanation: string | null;
  answered_at: string | null;
}

export interface DiagnosticSummary {
  strengths: string[];
  gaps: string[];
  review_topics: string[];
  next_step: string;
}

export interface Diagnostic {
  id: string;
  subject_id: string | null;
  topic: string;
  question_count: number;
  format: "choice" | "open" | "mixed";
  difficulty: "easy" | "medium" | "hard" | "adaptive";
  status: "generating" | "active" | "completed" | "failed";
  score: number | null;
  summary: DiagnosticSummary | null;
  request_id: string | null;
  created_at: string;
  questions: Question[];
}

export interface Dashboard {
  subjects: Subject[];
  recent_sessions: ChatSession[];
  open_labs: Lab[];
  recent_diagnostics: Diagnostic[];
}
