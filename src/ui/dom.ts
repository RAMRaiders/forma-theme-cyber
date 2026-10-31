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
