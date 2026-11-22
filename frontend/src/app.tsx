import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router";
import { authEvents } from "@/lib/api";
import { queryClient, useMe } from "@/lib/queries";
import { applyTheme, useUI } from "@/stores/ui";
import { AppShell } from "@/components/shell/app-shell";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorState } from "@/components/ui/feedback";
import { LoginPage } from "@/features/auth/login-page";
import { LogoMark } from "@/components/brand/logo";

const LandingPage = lazy(() => import("@/features/landing/landing-page").then((m) => ({ default: m.LandingPage })));

// Route-level code splitting: only the shell and login are in the main chunk.
const StudyHome = lazy(() => import("@/features/study/study-home").then((m) => ({ default: m.StudyHome })));
const SubjectPage = lazy(() => import("@/features/study/subject-page").then((m) => ({ default: m.SubjectPage })));
const DiagnosticSetup = lazy(() => import("@/features/study/diagnostics-page").then((m) => ({ default: m.DiagnosticSetup })));
const DiagnosticRun = lazy(() => import("@/features/study/diagnostics-page").then((m) => ({ default: m.DiagnosticRun })));
const DevHome = lazy(() => import("@/features/dev/dev-home").then((m) => ({ default: m.DevHome })));
const ProjectPage = lazy(() => import("@/features/dev/project-page").then((m) => ({ default: m.ProjectPage })));
const ChatPage = lazy(() => import("@/features/chat/chat-page").then((m) => ({ default: m.ChatPage })));

function Splash() {
  return (
    <div className="flex h-dvh items-center justify-center bg-bg">
      <LogoMark size={36} animated className="animate-pulse-dot" />
    </div>
  );
}

function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.isLoading) return <Splash />;
  if (me.isError) {
    return <ErrorState className="h-dvh justify-center" title="Сервер недоступний" message="Не вдалося з'єднатися з API. Переконайтеся, що backend запущено." onRetry={() => me.refetch()} />;
  }
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

function HomeRedirect() {
  const space = useUI((s) => s.space);
  return <Navigate to={space === "dev" ? "/dev" : "/study"} replace />;
}

/** "/" — the welcome page for guests, the workspace for signed-in users. */
function Root() {
  const me = useMe();
  if (me.isLoading) return <Splash />;
  if (me.data) return <HomeRedirect />;
  return (
    <Suspense fallback={<Splash />}>
      <LandingPage />
    </Suspense>
  );
}

function SpaceSync({ space }: { space: "study" | "dev" }) {
  const setSpace = useUI((s) => s.setSpace);
  useEffect(() => setSpace(space), [space, setSpace]);
  return <Outlet />;
}

function SessionExpiryListener() {
  const navigate = useNavigate();
  useEffect(() => {
    const onExpired = () => {
      queryClient.clear();
      navigate("/login", { replace: true });
    };
    authEvents.addEventListener("expired", onExpired);
    return () => authEvents.removeEventListener("expired", onExpired);
  }, [navigate]);
  return null;
}

function ThemeSync() {
  const theme = useUI((s) => s.theme);
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);
  return null;
}

const PageFallback = () => <div className="flex-1" />;

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider>
          <BrowserRouter>
            <ThemeSync />
            <SessionExpiryListener />
            <Routes>
              <Route index element={<Root />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<LoginPage />} />
              <Route element={<RequireAuth />}>
                <Route element={<AppShell />}>
                  <Route element={<Suspense fallback={<PageFallback />}><Outlet /></Suspense>}>
                    <Route element={<SpaceSync space="study" />}>
                      <Route path="/study" element={<StudyHome />} />
                      <Route path="/study/subjects/:subjectId" element={<SubjectPage />} />
                      <Route path="/study/diagnostics/new" element={<DiagnosticSetup />} />
                      <Route path="/study/diagnostics/:diagnosticId" element={<DiagnosticRun />} />
                    </Route>
                    <Route element={<SpaceSync space="dev" />}>
                      <Route path="/dev" element={<DevHome />} />
                      <Route path="/dev/projects/:projectId" element={<ProjectPage />} />
                    </Route>
                    <Route path="/chat/:sessionId" element={<ChatPage />} />
                  </Route>
                  <Route path="*" element={<ErrorState className="m-auto" title="Сторінку не знайдено" />} />
                </Route>
              </Route>
            </Routes>
            <Toaster />
          </BrowserRouter>
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
