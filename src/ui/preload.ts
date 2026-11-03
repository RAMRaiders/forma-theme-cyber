/**
 * Every system's pictures, fetched and decoded once, soon after start-up, and kept: moving
 * through a category then shows each system at once, its pictures already in memory, instead
 * of fetching and decoding them as it is reached (slow on a Raspberry Pi, and the cause of
 * pictures appearing late or flickering).
 *
 * One picture at a time, each after the last is decoded, so start-up and the first screen are
 * not slowed; the ones asked for first (the screen being looked at) go to the front.
 */
const kept = new Map<string, HTMLImageElement>();
const queue: string[] = [];
let running = false;

/** Fetches and decodes `urls` in the background; `first`: ahead of anything waiting. */
export function preload(urls: (string | null | undefined)[], first = false): void {
  const fresh = urls.filter((u): u is string => !!u && !kept.has(u) && !queue.includes(u));
  if (first) queue.unshift(...fresh);
  else queue.push(...fresh);
  if (!running) void drain();
}

/** The picture is fetched and decoded: an `<img>` with its URL shows it at once. */
export function ready(url: string): boolean {
  const img = kept.get(url);
  return !!img && img.complete && img.naturalWidth > 0;
}

async function drain(): Promise<void> {
  running = true;
  while (queue.length) {
    const url = queue.shift()!;
    if (kept.has(url)) continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    // Kept, so the decoded picture stays in memory for every later <img> of it.
    kept.set(url, img);
    await (typeof img.decode === 'function' ? img.decode().catch(() => undefined) : undefined);
  }
  running = false;
}

/** For tests: forget everything. */
export function resetPreload(): void {
  kept.clear();
  queue.length = 0;
  running = false;
}
