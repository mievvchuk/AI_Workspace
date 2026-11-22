import { emojiImage } from "@/lib/emoji";
import { cn } from "@/lib/utils";

const sizes = {
  xs: { box: "size-5 rounded-[6px]", img: "size-[15px]", text: "text-[12px]" },
  sm: { box: "size-7 rounded-lg", img: "size-5", text: "text-[15px]" },
  md: { box: "size-10 rounded-[11px]", img: "size-7", text: "text-[20px]" },
  lg: { box: "size-12 rounded-xl", img: "size-8", text: "text-[24px]" },
  xl: { box: "size-16 rounded-2xl", img: "size-11", text: "text-[32px]" },
};

/** Uniform, softly lit tile so subject emoji align and never dominate the name. */
export function SubjectEmoji({ emoji, size = "sm", className }: { emoji: string; size?: keyof typeof sizes; className?: string }) {
  const s = sizes[size];
  const src = emojiImage(emoji);
  return (
    <span aria-hidden className={cn("emoji-tile inline-flex shrink-0 items-center justify-center leading-none select-none", s.box, className)}>
      {src ? <img src={src} alt="" draggable={false} loading="lazy" decoding="async" className={cn("drop-shadow-[0_1px_1px_rgb(0_0_0/0.18)]", s.img)} /> : <span className={s.text}>{emoji}</span>}
    </span>
  );
}

/** Bare emoji (no tile), e.g. inside pickers and chips. */
export function EmojiGlyph({ emoji, className }: { emoji: string; className?: string }) {
  const src = emojiImage(emoji);
  return src ? <img src={src} alt="" draggable={false} loading="lazy" className={cn("inline-block size-5", className)} /> : <span className={className}>{emoji}</span>;
}
