// Small helpers for talking to the Home Assistant frontend.

export function fire<T>(target: EventTarget, type: string, detail?: T): void {
  target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

const EDITOR_TAGS = new Set(["HUI-CARD-PREVIEW", "HUI-CARD-OPTIONS", "HUI-DIALOG-EDIT-CARD", "HUI-DIALOG-EDIT-SECTION"]);

/** Whether the element sits inside the dashboard editor, where a hidden card must stay findable. */
export function insideEditor(element: Element): boolean {
  let node: Node | null = element;
  while (node) {
    if (node instanceof Element && EDITOR_TAGS.has(node.tagName)) return true;
    const root: Node = node.getRootNode();
    node = node.parentNode ?? (root instanceof ShadowRoot ? root.host : null);
  }
  return false;
}
