import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api, errorMessage } from "@/lib/api";
import { qk, queryClient } from "@/lib/queries";
import type { ChatSession, Space } from "@/lib/types";
import { toast } from "@/components/ui/toast";

export interface NewSessionInput {
  space: Space;
  subject_id?: string;
  project_id?: string;
}

/** Create a session and open it. Guarded against double clicks by isPending. */
export function useNewSession() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (input: NewSessionInput) => api.post<ChatSession>("/sessions", input),
    onSuccess: (s) => {
      queryClient.setQueryData(qk.session(s.id), s);
      queryClient.setQueryData(qk.messages(s.id), []);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      navigate(`/chat/${s.id}`);
    },
    onError: (e) => toast.error("Не вдалося створити сесію", errorMessage(e)),
  });
}
