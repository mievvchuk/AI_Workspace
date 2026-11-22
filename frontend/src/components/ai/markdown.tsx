import { memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/ui/copy-button";

/**
 * Safe Markdown: raw HTML is never rendered (no rehype-raw), and react-markdown's default
 * urlTransform drops javascript:/data: URLs. Links open in a new tab without opener access.
 */

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf((node as { props: { children?: ReactNode } }).props.children);
  return "";
}

const components: Components = {
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children;
    const className: string = (child as { props?: { className?: string } })?.props?.className ?? "";
    const lang = /language-([\w-]+)/.exec(className)?.[1];
    return (
      <div className="group/code overflow-hidden rounded-lg border border-line bg-[var(--code-bg)]">
        <div className="flex h-8 items-center justify-between border-b border-line pr-1 pl-3">
          <span className="font-mono text-2xs text-subtle">{lang ?? "text"}</span>
          <CopyButton text={textOf(children).replace(/\n$/, "")} label="Копіювати код" />
        </div>
        <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[13px] leading-[21px]">{children}</pre>
      </div>
    );
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto">
        <table>{children}</table>
      </div>
    );
  },
};

export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("prose-ai", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});

export default Markdown;
