export type PeekLink = HTMLAnchorElement | HTMLAreaElement;

export function isPeekLink(target: EventTarget): target is PeekLink {
  return (
    (target instanceof HTMLAnchorElement || target instanceof HTMLAreaElement) && target.href !== ""
  );
}
