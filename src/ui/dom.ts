/** `el('div', { class: 'card' }, child, 'text')`: enough DOM building for a theme this size. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string> = {},
  ...children: (Node | string | null)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) node.setAttribute(name, value);
  for (const child of children) if (child !== null) node.append(child);
  return node;
}

/** Root font size in px: the layout is in rem, scaled to the screen height. */
export function remPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

/**
 * Scrolls `box` (and only `box`, never the page) just enough to show `item`, and not at all
 * when it is already in view or `box` does not scroll: `scrollIntoView` also scrolls every
 * ancestor, the page included, which a pixel of overflow made jump.
 */
export function reveal(item: HTMLElement, box: HTMLElement, smooth = false): void {
  if (box.scrollHeight <= box.clientHeight + 2) return;
  const b = box.getBoundingClientRect();
  const r = item.getBoundingClientRect();
  // Room for the selection's glow, as the box's own padding leaves.
  const pad = parseFloat(getComputedStyle(box).paddingTop) || 0;
  let by = 0;
  if (r.top < b.top + pad) by = r.top - b.top - pad;
  else if (r.bottom > b.bottom - pad) by = r.bottom - b.bottom + pad;
  if (Math.abs(by) > 1) box.scrollBy({ top: by, behavior: smooth ? 'smooth' : 'auto' });
}
