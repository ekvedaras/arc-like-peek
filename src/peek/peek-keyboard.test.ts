import { expect, test } from "bun:test";
import { peekKeyCommand } from "./peek-keyboard.ts";

const press = (
  key: string,
  modifiers: Partial<Record<"altKey" | "ctrlKey" | "metaKey" | "shiftKey", boolean>> = {},
) =>
  peekKeyCommand({
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...modifiers,
  });

test("Esc dismisses the peek", () => {
  expect(press("Escape")).toBe("dismiss");
  expect(press("Escape", { shiftKey: true })).toBeNull();
});

test("Cmd+O or Ctrl+O opens the peek as a tab", () => {
  expect(press("o", { metaKey: true })).toBe("expand");
  expect(press("o", { ctrlKey: true })).toBe("expand");
  expect(press("O", { metaKey: true, shiftKey: true })).toBeNull();
  expect(press("o")).toBeNull();
});
