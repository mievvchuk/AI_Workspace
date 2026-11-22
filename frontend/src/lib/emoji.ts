import manifest from "./emoji-manifest.json";

/**
 * Subject emoji are rendered as Microsoft Fluent Emoji 3D images (MIT, see public/emoji/LICENSE.txt)
 * so they look the same, glossy and consistent, on every OS. Apple's emoji artwork can't be
 * redistributed, so on non-Apple systems this is the closest licensed equivalent.
 * Unknown emoji fall back to the system font.
 */
const map = manifest as Record<string, string>;
const VS16 = "️";

export function emojiImage(emoji: string): string | null {
  const code = map[emoji] ?? map[emoji + VS16] ?? map[emoji.replaceAll(VS16, "")];
  return code ? `/emoji/${code}.png` : null;
}
