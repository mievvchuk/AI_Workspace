import { Menu as MenuIcon, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Outlet, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { useUI } from "@/stores/ui";
import { IconButton } from "@/components/ui/button";
import { Drawer } from "@/components/ui/overlay";
import { CommandMenu } from "./command-menu";
import { SidebarContent } from "./sidebar";
import { ContextPanelHost } from "./context-panel";

/** Page header: breadcrumbs/title on the left, page actions on the right. Mobile gets the nav trigger. */
export function PageHeader({ title, leading, actions, className }: { title: ReactNode; leading?: ReactNode; actions?: ReactNode; className?: string }) {
  const setMobileNav = useUI((s) => s.setMobileNav);
  return (
    <header className={cn("flex h-12 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4", className)}>
      <IconButton label="Меню" className="md:hidden" onClick={() => setMobileNav(true)}>
        <MenuIcon />
      </IconButton>
      {leading}
      <div className="min-w-0 flex-1 truncate text-sm font-medium">{title}</div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}

export function AppShell() {
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const toggle = useUI((s) => s.toggleSidebar);
  const mobileOpen = useUI((s) => s.mobileNavOpen);
  const setMobileNav = useUI((s) => s.setMobileNav);
  const openPanel = useUI((s) => s.openPanel);
  const [cmdOpen, setCmdOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  // Close transient surfaces on navigation.
  useEffect(() => {
    setMobileNav(false);
    openPanel(null);
  }, [location.pathname, setMobileNav, openPanel]);

  return (
    <div className="app-ambient flex h-dvh overflow-hidden">
      <aside
        className={cn("hidden shrink-0 border-r border-line bg-bg/60 backdrop-blur-xl transition-[width] duration-[240ms] ease-[var(--ease-out)] md:block", collapsed ? "w-14" : "w-[252px]")}
        aria-label="Навігація"
      >
        <div className={cn("h-full", collapsed ? "w-14" : "w-[252px]")}>
          <SidebarContent collapsed={collapsed} onSearch={() => setCmdOpen(true)} />
        </div>
      </aside>
      <Drawer open={mobileOpen} onOpenChange={setMobileNav} title="Навігація">
        <div className="absolute top-2 right-2 z-10">
          <IconButton label="Закрити меню" tooltip={false} onClick={() => setMobileNav(false)}><X /></IconButton>
        </div>
        <SidebarContent onSearch={() => { setMobileNav(false); setCmdOpen(true); }} onNavigate={() => setMobileNav(false)} />
      </Drawer>
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
      <ContextPanelHost />
      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
