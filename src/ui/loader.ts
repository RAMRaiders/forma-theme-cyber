import { el } from './dom.js';

/**
 * Cyber's loading animation: a chip with eight traces that light up in turn, its core glowing,
 * and a scan bar under the label. Pure CSS on a small fixed-size SVG (style.css, `.loader`), so
 * it stays in its box and costs little on a Raspberry Pi. Still under reduced motion.
 */
export const LOADER_SVG =
  '<svg class="loader-chip" viewBox="0 0 120 120" aria-hidden="true">' +
  // Traces: out of each side, two per side, lit one after another.
  [
    'M60 38V6',
    'M82 48H114',
    'M60 82V114',
    'M38 72H6',
    'M70 38V20L80 10',
    'M82 70H100L110 80',
    'M50 82V100L40 110',
    'M38 50H20L10 40'
  ]
    .map(
      (d, i) =>
        `<path class="loader-trace" d="${d}"/><path class="loader-pulse" style="animation-delay:${(i * 0.15).toFixed(2)}s" d="${d}"/>`
    )
    .join('') +
  '<rect class="loader-body" x="38" y="38" width="44" height="44" rx="4"/>' +
  '<rect class="loader-core" x="50" y="50" width="20" height="20" rx="2"/>' +
  '</svg>';

export function loader(label: string, detail?: string): HTMLElement {
  const box = el('div', { class: 'loader', role: 'status' });
  box.innerHTML = LOADER_SVG;
  box.append(
    el('p', { class: 'loader-label' }, label),
    detail ? el('p', { class: 'loader-detail' }, detail) : '',
    el('div', { class: 'loader-bar', 'aria-hidden': 'true' }, el('span', {}))
  );
  return box;
}
