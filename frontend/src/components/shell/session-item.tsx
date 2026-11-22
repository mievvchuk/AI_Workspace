import { useMutation } from "@tanstack/react-query";
import { motion } from "motion/react";
import { MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router";
import { api, errorMessage } from "@/lib/api";
import { queryClient } from "@/lib/queries";
import type { ChatSession } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useStreams } from "@/features/chat/stream-store";
import { ActivityDot } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { ConfirmDialog, Dialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";

export function useSessionActions(session: ChatSession) {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["sessions"] });
  const update = useMutation({
    mutationFn: (body: Partial<ChatSession>) => api.patch<ChatSession>(`/sessions/${session.id}`, body),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["session", session.id] });
    },
    onError: (e) => toast.error("Не вдалося оновити сесію", errorMessage(e)),
  });
  const remove = async () => {
    try {
      await api.delete(`/sessions/${session.id}`);
      invalidate();
      if (sessionId === session.id) navigate(session.space === "dev" ? "/dev" : "/study");
      toast.success("Сесію видалено");
    } catch (e) {
      toast.error("Не вдалося видалити", errorMessage(e));
    }
  };
  return { update, remove };
}

export function SessionItem({ session, layoutGroup }: { session: ChatSession; layoutGroup: string }) {
  const live = useStreams((s) => !!s.streams[session.id]);
  const { update, remove } = useSessionActions(session);
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [title, setTitle] = useState(session.title);

  return (
    <>
      <NavLink
        to={`/chat/${session.id}`}
        className={({ isActive }) =>
          cn(
            "group relative flex h-8 items-center gap-2 rounded-md pr-1 pl-2.5 text-sm transition-colors duration-150",
            isActive ? "text-fg" : "text-muted hover:bg-hover/70 hover:text-fg",
          )
        }
      >
        {({ isActive }) => (
          <>
            {isActive && <motion.span layoutId={`active-${layoutGroup}`} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-0 rounded-md bg-hover" />}
            <span className="relative min-w-0 flex-1 truncate">{session.title}</span>
            {live && <ActivityDot className="relative" />}
            {session.pinned && !live && <Pin className="relative size-3 shrink-0 text-subtle" />}
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Дії із сесією"
                  onClick={(e) => e.preventDefault()}
                  className="relative flex size-6 shrink-0 items-center justify-center rounded text-subtle opacity-100 hover:bg-line hover:text-fg data-[state=open]:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </MenuTrigger>
              <MenuContent align="start">
                <MenuItem icon={<Pencil />} onSelect={() => { setTitle(session.title); setRenaming(true); }}>Перейменувати</MenuItem>
                <MenuItem icon={session.pinned ? <PinOff /> : <Pin />} onSelect={() => update.mutate({ pinned: !session.pinned })}>
                  {session.pinned ? "Відкріпити" : "Закріпити"}
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={<Trash2 />} destructive onSelect={() => setConfirm(true)}>Видалити</MenuItem>
              </MenuContent>
            </Menu>
          </>
        )}
      </NavLink>

      <Dialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Перейменувати сесію"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(false)}>Скасувати</Button>
            <Button variant="primary" loading={update.isPending} disabled={!title.trim()} onClick={() => update.mutate({ title: title.trim() }, { onSuccess: () => setRenaming(false) })}>
              Зберегти
            </Button>
          </>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) update.mutate({ title: title.trim() }, { onSuccess: () => setRenaming(false) }); }}>
          <Input autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} aria-label="Назва сесії" />
        </form>
      </Dialog>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Видалити сесію?" description={`«${session.title}» і вся історія повідомлень будуть видалені без можливості відновлення.`} onConfirm={remove} />
    </>
  );
}
