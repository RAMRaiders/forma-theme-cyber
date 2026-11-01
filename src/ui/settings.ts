import type {
  Forma,
  OptionChoice,
  OptionItem,
  OptionsScope,
  SystemSetting
} from '@ramraiders/forma-sdk';

import type { Page, Row } from './page.js';

/** Choice lists longer than this open a list to pick from; shorter ones just cycle. */
const CYCLE_MAX = 6;

/** Words Batocera writes in capitals that stay that way in sentence case. */
const KEEP_CAPS = new Set([
  'AI',
  'API',
  'BIOS',
  'CPU',
  'CRT',
  'FPS',
  'GPU',
  'HD',
  'HUD',
  'MSAA',
  'NTSC',
  'OSD',
  'PAL',
  'PNG',
  'RAM',
  'RGB',
  'SNES',
  'NES',
  'USB',
  'VRR',
  'XBR'
]);

/** `GAME ASPECT RATIO` as `Game aspect ratio`; `AI`, `4K`, `N64` and the like stay. */
export function sentence(label: string): string {
  if (label !== label.toUpperCase()) return label;
  const words = label.split(/(\s+|[/(),.&-])/);
  let first = true;
  return words
    .map((w) => {
      if (!/[A-Z]/.test(w)) return w;
      const bare = w.replace(/[^A-Z0-9]/g, '');
      let out: string;
      if (KEEP_CAPS.has(bare) || /\d/.test(w)) out = w;
      else out = first ? w[0] + w.slice(1).toLowerCase() : w.toLowerCase();
      first = false;
      return out;
    })
    .join('');
}

/** A list to pick one from, as a deeper page; `null` is the "default" entry. */
function pick(
  page: Page,
  title: string,
  choices: OptionChoice[],
  current: string | null,
  set: (value: string | null) => Promise<void>,
  fallback: string | null
): Promise<void> {
  const at =
    Math.max(
      0,
      choices.findIndex((c) => c.value === current)
    ) + (fallback !== null && current !== null ? 1 : 0);
  return page.push(
    sentence(title),
    () => [
      ...(fallback !== null
        ? [
            {
              label: current === null ? `✓ ${fallback}` : fallback,
              run: () => page.pop().then(() => page.run('Saving…', () => set(null)))
            }
          ]
        : []),
      ...choices.map((c) => ({
        label: c.value === current ? `✓ ${c.label}` : c.label,
        run: () => page.pop().then(() => page.run('Saving…', () => set(c.value)))
      }))
    ],
    undefined,
    at
  );
}

function labelOf(choices: OptionChoice[], value: string): string {
  return choices.find((c) => c.value === value)?.label ?? value;
}

/** What an option is now: set here, inherited from a level above, or Batocera's default. */
function optionDetail(o: OptionItem): string {
  if (o.value !== null) return o.kind === 'choice' ? labelOf(o.choices, o.value) : o.value;
  const from = o.inherited
    ? `${o.kind === 'choice' ? labelOf(o.choices, o.inherited.value) : o.inherited.value} (${o.inherited.from === 'global' ? 'game settings' : 'system'})`
    : o.default !== null
      ? o.kind === 'choice'
        ? labelOf(o.choices, o.default)
        : o.default
      : null;
  return from ? `Default · ${from}` : 'Default';
}

function optionRow(forma: Forma, page: Page, scope: OptionsScope, o: OptionItem): Row {
  const set = (value: string | null) => forma.options.set(scope, o.key, value);
  const save = (value: string | null) => page.run('Saving…', () => set(value));
  const label = sentence(o.label);
  const row: Row = {
    label,
    detail: optionDetail(o),
    alt: o.value !== null ? { label: 'Default', run: () => save(null) } : undefined
  };
  if (o.kind === 'number') {
    const min = o.min ?? 0;
    const max = o.max ?? 100;
    const step = o.step ?? 1;
    const now = Number(o.value ?? o.inherited?.value ?? o.default ?? min);
    row.adjust = (dir) => save(String(Math.min(max, Math.max(min, now + dir * step))));
    row.run = () => save(String(now >= max ? min : Math.min(max, now + step)));
  } else if (o.kind === 'text') {
    row.run = async () => {
      const typed = await page.ask({ title: label, value: o.value ?? '' });
      if (typed !== null) await save(typed.trim() || null);
    };
  } else if (o.choices.length > 0) {
    // Cycling includes "default" (unset), so a value can be taken back without Y.
    const values: (string | null)[] = [null, ...o.choices.map((c) => c.value)];
    const cycle = (dir: -1 | 1) =>
      save(values[(values.indexOf(o.value) + dir + values.length) % values.length] ?? null);
    row.adjust = cycle;
    row.run =
      o.choices.length > CYCLE_MAX
        ? () => pick(page, o.label, o.choices, o.value, set, 'Default')
        : () => cycle(1);
  }
  return row;
}

/**
 * Emulator options at one level, as ES's game settings menus have them: the emulator and core,
 * then the core's options, in Batocera's groups; an option with a `submenu` sits on a page of its
 * own. Read again after every change: another emulator or core means other options.
 */
export function optionsScreen(
  forma: Forma,
  page: Page,
  scope: OptionsScope,
  submenu: string | null = null
): () => Promise<Row[]> {
  return async () => {
    const { options } = await forma.options.get(scope);
    const here = options.filter((o) => o.submenu === submenu);
    const rows: Row[] = [];
    // Ungrouped first, in Batocera's order; then each group under its heading.
    const groups: (string | null)[] = [null];
    for (const o of here) if (o.group && !groups.includes(o.group)) groups.push(o.group);
    for (const group of groups) {
      here
        .filter((o) => o.group === group)
        .forEach((o, i) =>
          rows.push({
            ...optionRow(forma, page, scope, o),
            heading: i === 0 && group ? sentence(group) : undefined
          })
        );
    }
    if (submenu === null) {
      const pages: string[] = [];
      for (const o of options) if (o.submenu && !pages.includes(o.submenu)) pages.push(o.submenu);
      pages.forEach((name, i) => {
        const inside = options.filter((o) => o.submenu === name);
        const set = inside.filter((o) => o.value !== null).length;
        rows.push({
          heading: i === 0 ? 'More' : undefined,
          label: `${sentence(name)}…`,
          detail: set > 0 ? `${set} set here` : `${inside.length} options`,
          run: () => page.push(sentence(name), optionsScreen(forma, page, scope, name))
        });
      });
    }
    return rows;
  };
}

const APPLIES: Record<SystemSetting['applies'], string> = {
  now: '',
  restart: ' · after Forma restarts',
  reboot: ' · after a reboot'
};

/** Batocera's system settings, as ES's System settings menu has them, by section. */
export function systemSettingsScreen(forma: Forma, page: Page): () => Promise<Row[]> {
  return async () => {
    const settings = await forma.system.settings();
    const rows: Row[] = [
      {
        label: 'About this box…',
        detail: 'Batocera version, model, memory, storage, address',
        run: () =>
          page.push('About this box', async () =>
            (await forma.system.info()).map((i) => ({ label: i.label, detail: i.value }))
          )
      }
    ];
    let section = '';
    for (const s of settings) {
      const set = async (value: string | null) => {
        await forma.system.set(s.key, value);
      };
      const save = (value: string | null) =>
        page.run('Saving…', async () => {
          await set(value);
          if (s.applies === 'reboot') return `${s.label}: takes effect after a reboot`;
          if (s.applies === 'restart') return `${s.label}: takes effect when Forma restarts`;
        });
      const now = s.value === null ? 'Default' : labelOf(s.choices, s.value);
      const row: Row = {
        heading: s.section !== section ? s.section : undefined,
        label: s.label,
        detail: `${now}${APPLIES[s.applies]}`
      };
      section = s.section;
      if (s.kind === 'text') {
        row.run = async () => {
          const typed = await page.ask({ title: s.label, value: s.value ?? '' });
          if (typed !== null) await save(typed.trim() || null);
        };
      } else if (s.choices.length > 0) {
        const values = s.choices.map((c) => c.value);
        const cycle = (dir: -1 | 1) => {
          const at = s.value === null ? (dir > 0 ? -1 : 0) : values.indexOf(s.value);
          return save(values[(at + dir + values.length) % values.length] ?? null);
        };
        row.adjust = cycle;
        row.run =
          s.choices.length > CYCLE_MAX
            ? () =>
                pick(
                  page,
                  s.label,
                  s.choices,
                  s.value,
                  set,
                  // The storage device always has one; the rest fall back to Batocera's.
                  s.key === 'storage' ? null : 'Default'
                )
            : () => cycle(1);
      }
      rows.push(row);
    }
    return rows;
  };
}
