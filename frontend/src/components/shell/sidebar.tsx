import { AnimatePresence, motion } from "motion/react";
import { BookOpen, Code2, FolderKanban, Laptop, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, Sun } from "lucide-react";
import { useMemo } from "react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router";
import { api } from "@/lib/api";
import { queryClient, useMe, useProjects, useSession, useSessions, useSubjects } from "@/lib/queries";
import type { Space } from "@/lib/types";
import { cn, recencyGroup } from "@/lib/utils";
import { dur, t } from "@/lib/motion";
import { useUI, type Theme } from "@/stores/ui";
import { useNewSession } from "@/features/chat/use-new-session";
import { IconButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/feedback";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { UsageIndicator } from "@/components/ai/selectors";
import { SessionItem } from "./session-item";
import { SubjectEmoji } from "./subject-emoji";
import { Logo, LogoMark } from "@/components/brand/logo";

/** Resolve the subject/project the user is currently looking at, so "new session" binds to it. */
export function useCurrentScope(): { space: Space; subjectId?: string; projectId?: string } {
  const { subjectId, projectId, sessionId } = useParams();
  const space = useUI((s) => s.space);
  const session = useSession(sessionId ?? "");
  if (subjectId) return { space: "study", subjectId };
  if (projectId) return { space: "dev", projectId };
  if (sessionId && session.data) return { space: session.data.space, subjectId: session.data.subject_id ?? undefined, projectId: session.data.project_id ?? undefined };
  return { space };
}

function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const space = useUI((s) => s.space);
  const setSpace = useUI((s) => s.setSpace);
  const navigate = useNavigate();
  const go = (s: Space) => {
    setSpace(s);
    navigate(s === "study" ? "/study" : "/dev");
  };
  const items: { value: Space; label: string; icon: typeof BookOpen }[] = [
    { value: "study", label: "Навчання", icon: BookOpen },
    { value: "dev", label: "Розробка", icon: Code2 },
  ];
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1">
        {items.map((i) => (
          <IconButton key={i.value} label={i.label} onClick={() => go(i.value)} className={cn(space === i.value && "bg-hover text-fg")}>
            <i.icon />
          </IconButton>
        ))}
      </div>
    );
  }
  return (
    <div role="tablist" aria-label="Робочий простір" className="relative grid grid-cols-2 rounded-lg border border-line bg-sunken p-0.5">
      {items.map((i) => (
        <button
          key={i.value}
          role="tab"
          aria-selected={space === i.value}
          onClick={() => go(i.value)}
          className={cn("relative flex h-8 items-center justify-center gap-1.5 rounded-md text-sm transition-colors duration-150", space === i.value ? "text-fg" : "text-muted hover:text-fg")}
        >
          {space === i.value && <motion.span layoutId="space-pill" transition={t(dur.sidebar)} className="absolute inset-0 rounded-md bg-surface shadow-[var(--shadow-float)]" />}
          <i.icon className="relative size-3.5" />
          <span className="relative">{i.label}</span>
        </button>
      ))}
    </div>
  );
}

function SectionLabel({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <div className="flex h-7 items-center justify-between pr-1 pl-2.5">
      <span className="text-xs font-medium text-subtle">{children}</span>
      {action}
    </div>
  );
}

function ScopeList({ space }: { space: Space }) {
  const subjects = useSubjects();
  const projects = useProjects();
  const navigate = useNavigate();
  const q = space === "study" ? subjects : projects;
  return (
    <div>
      <SectionLabel action={<IconButton label={space === "study" ? "Новий предмет" : "Новий проєкт"} size="sm" onClick={() => navigate(space === "study" ? "/study?new=1" : "/dev?new=1")}><Plus /></IconButton>}>
        {space === "study" ? "Предмети" : "Проєкти"}
      </SectionLabel>
      {q.isLoading && <div className="space-y-1 px-2.5 py-1"><Skeleton className="h-5" /><Skeleton className="h-5 w-3/4" /></div>}
      {q.data?.length === 0 && <p className="px-2.5 py-1 text-xs text-subtle">{space === "study" ? "Ще немає предметів" : "Ще немає проєктів"}</p>}
      <nav className="space-y-px">
        {space === "study"
          ? subjects.data?.slice(0, 12).map((s) => (
              <NavLink key={s.id} to={`/study/subjects/${s.id}`} className={({ isActive }) => cn("flex h-9 items-center gap-2.5 rounded-md px-2 text-sm transition-colors duration-150", isActive ? "bg-hover text-fg" : "text-muted hover:bg-hover/70 hover:text-fg")}>
                <SubjectEmoji emoji={s.emoji} size="xs" />
                <span className="truncate">{s.name}</span>
              </NavLink>
            ))
          : projects.data?.slice(0, 12).map((p) => (
              <NavLink key={p.id} to={`/dev/projects/${p.id}`} className={({ isActive }) => cn("flex h-9 items-center gap-2.5 rounded-md px-2 text-sm transition-colors duration-150", isActive ? "bg-hover text-fg" : "text-muted hover:bg-hover/70 hover:text-fg")}>
                <FolderKanban className="size-3.5 shrink-0 text-subtle" />
                <span className="truncate">{p.name}</span>
              </NavLink>
            ))}
      </nav>
    </div>
  );
}

function SessionList({ space }: { space: Space }) {
  const { data, isLoading } = useSessions({ space });
  const groups = useMemo(() => {
    const out: [string, NonNullable<typeof data>][] = [];
    const pinned = data?.filter((s) => s.pinned) ?? [];
    if (pinned.length) out.push(["Закріплені", pinned]);
    for (const s of data?.filter((x) => !x.pinned) ?? []) {
      const g = recencyGroup(s.updated_at);
      const last = out[out.length - 1];
      if (last && last[0] === g) last[1].push(s);
      else out.push([g, [s]]);
    }
    return out;
  }, [data]);
  if (isLoading) return <div className="space-y-1.5 px-2.5 pt-2"><Skeleton className="h-5" /><Skeleton className="h-5 w-4/5" /><Skeleton className="h-5 w-2/3" /></div>;
  if (!data?.length) return <p className="px-2.5 pt-1 text-xs text-subtle">Сесій поки немає</p>;
  return (
    <div className="space-y-3">
      {groups.map(([label, items]) => (
        <div key={label}>
          <SectionLabel>{label}</SectionLabel>
          <div className="space-y-px">
            {items.map((s) => <SessionItem key={s.id} session={s} layoutGroup="sidebar" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProfileMenu({ collapsed }: { collapsed: boolean }) {
  const { data: me } = useMe();
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  const navigate = useNavigate();
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      queryClient.clear();
      navigate("/login");
    }
  };
  const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: "system", label: "Системна", icon: Laptop },
    { value: "light", label: "Світла", icon: Sun },
    { value: "dark", label: "Темна", icon: Moon },
  ];
  const initials = (me?.name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" aria-label="Профіль і налаштування" className={cn("flex h-10 w-full items-center gap-2.5 rounded-md px-1.5 text-left transition-colors hover:bg-hover data-[state=open]:bg-hover", collapsed && "justify-center px-0")}>
          {me?.avatar_url ? (
            <img src={me.avatar_url} alt="" referrerPolicy="no-referrer" className="size-7 shrink-0 rounded-full" />
          ) : (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xs font-medium text-accent">{initials}</span>
          )}
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{me?.name}</span>
              <span className="block truncate text-2xs text-subtle">{me?.email}</span>
            </span>
          )}
          {!collapsed && <Settings2 className="size-3.5 shrink-0 text-subtle" />}
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="w-60">
        <div className="px-2 pt-1.5 pb-2"><UsageIndicator /></div>
        <MenuSeparator />
        <MenuLabel>Тема</MenuLabel>
        {themes.map((th) => (
          <MenuItem key={th.value} icon={<th.icon />} onSelect={() => setTheme(th.value)} shortcut={theme === th.value ? "обрано" : undefined}>
            {th.label}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem icon={<LogOut />} onSelect={logout}>Вийти</MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function SidebarContent({ collapsed = false, onSearch, onNavigate }: { collapsed?: boolean; onSearch: () => void; onNavigate?: () => void }) {
  const space = useUI((s) => s.space);
  const toggle = useUI((s) => s.toggleSidebar);
  const scope = useCurrentScope();
  const newSession = useNewSession();
  const location = useLocation();

  return (
    <div className="flex h-full flex-col" onClick={(e) => onNavigate && (e.target as HTMLElement).closest("a") && onNavigate()}>
      <div className={cn("flex h-12 shrink-0 items-center gap-2 px-3", collapsed && "flex-col justify-center gap-1 px-0 pt-2 h-auto")}>
        {collapsed && <LogoMark size={26} animated />}
        {!collapsed && (
          <NavLink to="/" className="flex items-center rounded-md" aria-label="AI Workspace — головна">
            <Logo size={24} animated />
          </NavLink>
        )}
        <div className={cn(!collapsed && "ml-auto")}>
          <IconButton label={collapsed ? "Розгорнути панель" : "Згорнути панель"} shortcut="Ctrl B" size="sm" onClick={toggle} className="hidden md:inline-flex">
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </IconButton>
        </div>
      </div>

      <div className={cn("space-y-2 px-2.5 pb-2", collapsed && "px-2")}>
        <WorkspaceSwitcher collapsed={collapsed} />
        {collapsed ? (
          <div className="flex flex-col items-center gap-1 pt-1">
            <IconButton label="Нова сесія" variant="outline" onClick={() => newSession.mutate({ space: scope.space, subject_id: scope.subjectId, project_id: scope.projectId })} disabled={newSession.isPending}>
              <Plus />
            </IconButton>
            <IconButton label="Пошук" shortcut="Ctrl K" onClick={onSearch}><Search /></IconButton>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={newSession.isPending}
              onClick={() => newSession.mutate({ space: scope.space, subject_id: scope.subjectId, project_id: scope.projectId })}
              className="flex h-8 flex-1 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-sm font-medium transition-[border-color,background-color] duration-150 hover:border-line-hover disabled:opacity-60"
            >
              <Plus className="size-3.5" />
              Нова сесія
            </button>
            <Tooltip content="Пошук і команди" shortcut="Ctrl K">
              <button type="button" onClick={onSearch} aria-label="Пошук" className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-muted transition-colors hover:border-line-hover hover:text-fg">
                <Search className="size-3.5" />
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      {!collapsed && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={space}
            initial={{ opacity: 0, x: space === "dev" ? 8 : -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: space === "dev" ? -8 : 8 }}
            transition={t(dur.page)}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pt-2 pb-4"
          >
            <nav>
              <NavLink to={space === "study" ? "/study" : "/dev"} end className={({ isActive }) => cn("flex h-8 items-center gap-2 rounded-md px-2.5 text-sm transition-colors", isActive && !location.search ? "bg-hover text-fg" : "text-muted hover:bg-hover/70 hover:text-fg")}>
                {space === "study" ? <BookOpen className="size-3.5" /> : <FolderKanban className="size-3.5" />}
                {space === "study" ? "Огляд навчання" : "Каталог проєктів"}
              </NavLink>
            </nav>
            <ScopeList space={space} />
            <div>
              <SessionList space={space} />
            </div>
          </motion.div>
        </AnimatePresence>
      )}
      {collapsed && <div className="flex-1" />}

      <div className={cn("shrink-0 space-y-2 border-t border-line p-2", collapsed && "px-1.5")}>
        <ProfileMenu collapsed={collapsed} />
      </div>
    </div>
  );
}
