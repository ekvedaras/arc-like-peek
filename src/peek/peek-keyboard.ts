export type PeekKeyCommand = "dismiss" | "expand";

export type KeyPress = {
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
};

/** Esc closes the Peek; ⌘O (Ctrl+O off macOS) opens it as a tab, as in Arc. */
export function peekKeyCommand(press: KeyPress): PeekKeyCommand | null {
  const hasModifier = press.altKey || press.ctrlKey || press.metaKey || press.shiftKey;
  if (press.key === "Escape" && !hasModifier) return "dismiss";

  const isPrimaryModifierOnly =
    (press.metaKey || press.ctrlKey) && !(press.altKey || press.shiftKey);
  if (press.key.toLowerCase() === "o" && isPrimaryModifierOnly) return "expand";
  return null;
}
