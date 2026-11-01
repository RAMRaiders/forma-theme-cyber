import type { Forma, StorePackage } from '@ramraiders/forma-sdk';

import type { Page, Row } from './page.js';

/** Batocera's groups that are not a system's games, by what Cyber calls them. */
const GROUPS: Record<string, string> = {
  bezel: 'Decorations',
  music: 'Music',
  ports: 'Ports',
  misc: 'Other'
};

/** `Amoeba Jump - Infinite Jumper with RetroAchievements`: the title, then what it is. */
function title(p: StorePackage): [string, string] {
  const at = p.description.indexOf(' - ');
  return at > 0
    ? [p.description.slice(0, at), p.description.slice(at + 3)]
    : [p.description || p.name, ''];
}

function size(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function status(p: StorePackage): string {
  if (p.update) return 'Update available';
  return p.installed ? 'Installed' : size(p.downloadSize);
}

/**
 * The content downloader: Batocera's free games, ports, decorations and music, by category,
 * as ES's content downloader has them. A installs (or updates), Y removes; a download shows its
 * progress while it runs.
 */
export function storeScreen(forma: Forma, page: Page): () => Promise<Row[]> {
  const install = (p: StorePackage) =>
    page.run(`Downloading ${title(p)[0]}…`, async () => {
      const stop = forma.events.on('store:progress', (e) => {
        if (e.name !== p.name) return;
        page.progress(
          e.stage === 'download'
            ? `Downloading ${title(p)[0]}… ${e.percent}%`
            : `Installing ${title(p)[0]}…`
        );
      });
      try {
        await forma.store.install(p.name);
      } finally {
        stop();
      }
      return `${title(p)[0]} ${p.update ? 'updated' : 'installed'}`;
    });
  const remove = (p: StorePackage) =>
    page.run(`Removing ${title(p)[0]}…`, async () => {
      await forma.store.remove(p.name);
      return `${title(p)[0]} removed`;
    });
  const row = (p: StorePackage): Row => {
    const [name, what] = title(p);
    return {
      label: name,
      detail: [what, status(p)].filter(Boolean).join(' · '),
      run: !p.installed || p.update ? () => install(p) : undefined,
      alt: p.installed ? { label: 'Remove', run: () => remove(p) } : undefined
    };
  };
  /** A category's packages, read again each time: what is installed changes. */
  const category = (pick: (p: StorePackage) => boolean) => async () =>
    (await forma.store.list()).filter(pick).map(row);

  return async () => {
    const [packages, systems] = await Promise.all([
      forma.store.list(),
      forma.library.systems().catch(() => [])
    ]);
    const fullname = new Map(systems.map((s) => [s.name, s.fullname]));
    const groupLabel = (p: StorePackage) =>
      p.system ? (fullname.get(p.system) ?? p.system.toUpperCase()) : (GROUPS[p.group] ?? p.group);
    const updates = packages.filter((p) => p.update);
    const installed = packages.filter((p) => p.installed);
    const rows: Row[] = [];
    if (updates.length > 0) {
      rows.push({
        label: `Update all (${updates.length})`,
        detail: updates.map((p) => title(p)[0]).join(', '),
        run: () =>
          page.run('Updating…', async () => {
            await forma.store.update();
            return 'Everything is up to date';
          })
      });
    }
    rows.push({
      label: 'Refresh the list',
      detail: 'Read what is new from Batocera’s store',
      run: () =>
        page.run('Refreshing…', async () => {
          await forma.store.refresh();
        })
    });
    if (installed.length > 0) {
      rows.push({
        label: `Installed (${installed.length})`,
        detail: 'Y on one removes it',
        run: () =>
          page.push(
            'Installed',
            category((p) => p.installed)
          )
      });
    }
    // Decorations, music and ports first, then each system's games by name, then the rest.
    const labels = [...new Set(packages.map(groupLabel))];
    const order = (label: string) => {
      const fixed = ['Decorations', 'Music', 'Ports'].indexOf(label);
      return fixed >= 0 ? fixed : label === 'Other' ? 99 : 3;
    };
    labels.sort((a, b) => order(a) - order(b) || a.localeCompare(b));
    labels.forEach((label, i) => {
      const inside = packages.filter((p) => groupLabel(p) === label);
      const have = inside.filter((p) => p.installed).length;
      rows.push({
        heading: i === 0 ? 'Categories' : undefined,
        label,
        detail: `${inside.length} ${inside.length === 1 ? 'item' : 'items'}${have ? ` · ${have} installed` : ''}`,
        run: () =>
          page.push(
            label,
            category((p) => groupLabel(p) === label)
          )
      });
    });
    return rows;
  };
}
