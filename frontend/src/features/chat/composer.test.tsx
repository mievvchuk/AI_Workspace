import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeAll } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Composer } from "./composer";

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as typeof window.matchMedia;
});

function setup(props: Partial<Parameters<typeof Composer>[0]> = {}) {
  const onSend = vi.fn();
  const onStop = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <Composer draftKey="t" modelId="m" effort="medium" onModel={() => {}} onEffort={() => {}} streaming={false} onSend={onSend} onStop={onStop} {...props} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { onSend, onStop, box: screen.getByLabelText("Повідомлення") as HTMLTextAreaElement };
}

describe("Composer", () => {
  it("sends on Enter and keeps Shift+Enter for new lines", () => {
    const { onSend, box } = setup();
    fireEvent.change(box, { target: { value: "Привіт" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("Привіт", []);
    expect(box.value).toBe("");
  });

  it("does not send empty text or while streaming", () => {
    const { onSend, box } = setup({ streaming: true });
    fireEvent.change(box, { target: { value: "x" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Зупинити генерацію")).toBeInTheDocument();
  });
});
