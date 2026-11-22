import { QueryClient, keepPreviousData, useQuery } from "@tanstack/react-query";
import { ApiError, api } from "./api";
import type {
  AIRequestLog,
  ActivityItem,
  Category,
  ChatSession,
  Dashboard,
  Diagnostic,
  Lab,
  Message,
  ModelInfo,
  Project,
  Space,
  StoredFile,
  Subject,
  Usage,
  User,
} from "./types";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

export const qk = {
  me: ["me"] as const,
  authConfig: ["auth-config"] as const,
  subjects: ["subjects"] as const,
  subject: (id: string) => ["subjects", id] as const,
  dashboard: ["dashboard"] as const,
  subjectFiles: (id: string) => ["subjects", id, "files"] as const,
  labs: (subjectId: string) => ["subjects", subjectId, "labs"] as const,
  sessions: (f: SessionFilter = {}) => ["sessions", f] as const,
  session: (id: string) => ["session", id] as const,
  messages: (id: string) => ["session", id, "messages"] as const,
  models: ["models"] as const,
  usage: ["usage"] as const,
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  projectFiles: (id: string) => ["projects", id, "files"] as const,
  activity: (id: string) => ["projects", id, "activity"] as const,
  categories: ["categories"] as const,
  diagnostics: (subjectId?: string) => ["diagnostics", subjectId ?? "all"] as const,
  diagnostic: (id: string) => ["diagnostic", id] as const,
  request: (id: string) => ["request", id] as const,
};

export interface SessionFilter {
  space?: Space;
  subject_id?: string;
  project_id?: string;
  q?: string;
}

const qs = (params: object) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  return entries.length ? `?${new URLSearchParams(entries as [string, string][])}` : "";
};

const PENDING_FILE = new Set(["uploaded", "parsing", "indexing"]);
/** Poll while any file is still being processed by the backend; stop once all are terminal. */
const pollFiles = (q: { state: { data?: StoredFile[] } }) => (q.state.data?.some((f) => PENDING_FILE.has(f.status)) ? 1200 : false);

/** Signed-in user or null for guests (the endpoint answers 200 either way, so guests see no console errors). */
export const useMe = () =>
  useQuery({ queryKey: qk.me, queryFn: async () => (await api.get<{ user: User | null }>("/auth/session")).user, retry: 1, staleTime: Infinity });
export const useAuthConfig = () => useQuery({ queryKey: qk.authConfig, queryFn: () => api.get<{ google_enabled: boolean }>("/auth/config"), staleTime: Infinity });

export const useSubjects = () => useQuery({ queryKey: qk.subjects, queryFn: () => api.get<Subject[]>("/subjects") });
export const useSubject = (id: string) => useQuery({ queryKey: qk.subject(id), queryFn: () => api.get<Subject>(`/subjects/${id}`) });
export const useDashboard = () => useQuery({ queryKey: qk.dashboard, queryFn: () => api.get<Dashboard>("/study/dashboard") });
export const useSubjectFiles = (id: string) =>
  useQuery({ queryKey: qk.subjectFiles(id), queryFn: () => api.get<StoredFile[]>(`/subjects/${id}/files`), refetchInterval: pollFiles });
export const useLabs = (subjectId: string) => useQuery({ queryKey: qk.labs(subjectId), queryFn: () => api.get<Lab[]>(`/subjects/${subjectId}/labs`) });

export const useSessions = (f: SessionFilter = {}) =>
  useQuery({ queryKey: qk.sessions(f), queryFn: () => api.get<ChatSession[]>(`/sessions${qs(f)}`), placeholderData: keepPreviousData });
export const useSession = (id: string) => useQuery({ queryKey: qk.session(id), queryFn: () => api.get<ChatSession>(`/sessions/${id}`) });
export const useMessages = (id: string) =>
  useQuery({ queryKey: qk.messages(id), queryFn: () => api.get<Message[]>(`/sessions/${id}/messages`), staleTime: Infinity });

export const useModels = () => useQuery({ queryKey: qk.models, queryFn: () => api.get<ModelInfo[]>("/models"), staleTime: Infinity });
export const useUsage = () => useQuery({ queryKey: qk.usage, queryFn: () => api.get<Usage>("/usage") });

export const useProjects = () => useQuery({ queryKey: qk.projects, queryFn: () => api.get<Project[]>("/projects") });
export const useProject = (id: string) => useQuery({ queryKey: qk.project(id), queryFn: () => api.get<Project>(`/projects/${id}`) });
export const useProjectFiles = (id: string) =>
  useQuery({ queryKey: qk.projectFiles(id), queryFn: () => api.get<StoredFile[]>(`/projects/${id}/files`), refetchInterval: pollFiles });
export const useOwnerFiles = (kind: "subject" | "project", id: string) =>
  useQuery({
    queryKey: kind === "subject" ? qk.subjectFiles(id) : qk.projectFiles(id),
    queryFn: () => api.get<StoredFile[]>(`/${kind === "subject" ? "subjects" : "projects"}/${id}/files`),
    refetchInterval: pollFiles,
  });
export const useActivity = (id: string) => useQuery({ queryKey: qk.activity(id), queryFn: () => api.get<ActivityItem[]>(`/projects/${id}/activity`) });
export const useCategories = () => useQuery({ queryKey: qk.categories, queryFn: () => api.get<Category[]>("/categories") });

export const useDiagnostics = (subjectId?: string) =>
  useQuery({ queryKey: qk.diagnostics(subjectId), queryFn: () => api.get<Diagnostic[]>(`/diagnostics${qs({ subject_id: subjectId })}`) });
export const useDiagnostic = (id: string | null) =>
  useQuery({ queryKey: qk.diagnostic(id ?? ""), queryFn: () => api.get<Diagnostic>(`/diagnostics/${id}`), enabled: !!id });

export const useRequestLog = (id: string | null, enabled = true) =>
  useQuery({ queryKey: qk.request(id ?? ""), queryFn: () => api.get<AIRequestLog>(`/requests/${id}`), enabled: !!id && enabled, staleTime: Infinity });
