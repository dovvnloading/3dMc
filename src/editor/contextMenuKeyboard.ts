/** Roving focus skips unavailable commands, wraps, and handles an all-disabled menu. */
export type MenuNavigationKey = "ArrowDown" | "ArrowUp" | "Home" | "End";
export function nextMenuIndex(items: readonly { enabled: boolean }[],
  current: number, key: MenuNavigationKey): number {
  const enabled = items.flatMap((item, index) => item.enabled ? [index] : []);
  if (!enabled.length) return -1;
  if (key === "Home") return enabled[0]!;
  if (key === "End") return enabled[enabled.length - 1]!;
  const at = enabled.indexOf(current);
  if (at < 0) return key === "ArrowDown" ? enabled[0]! : enabled[enabled.length - 1]!;
  return enabled[(at + (key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length]!;
}
