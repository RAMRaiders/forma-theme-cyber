import type { BatoceraSetting, Forma, MusicSource, MusicStatus } from '@ramraiders/forma-sdk';

import type { Prefs } from '../data/prefs.js';
import { type Page, type Row, onOff } from './page.js';

/** Music: what plays, the controls, and everything there is to play. */
export function musicScreen(forma: Forma, page: Page): () => Promise<Row[]> {
  let shuffle: boolean | null = null;
  const act = (label: string, work: () => Promise<unknown>) =>
    page.run(label, async () => {
      await work();
    });

  return async () => {
    const [status, sources] = await Promise.all([forma.music.status(), forma.music.sources()]);
    shuffle ??= status.shuffle;
    const rows: Row[] = [{ label: nowPlaying(status), detail: playingDetail(status) }];
    if (status.state !== 'stopped') {
      rows.push(
        {
          label: status.state === 'playing' ? 'Pause' : 'Resume',
          run: () => act('…', () => forma.music.toggle())
        },
        ...(status.tracks !== null
          ? [
              { label: 'Next', run: () => act('…', () => forma.music.next()) },
              { label: 'Previous', run: () => act('…', () => forma.music.previous()) }
            ]
          : []),
        {
          label: 'Stop',
          detail: 'Nothing plays at the next start either',
          run: () => act('Stopping…', () => forma.music.stop())
        }
      );
    }
    rows.push(
      {
        label: 'Volume',
        detail: `${status.volume}%`,
        adjust: (step) =>
          act('…', () =>
            forma.music.setVolume(Math.max(0, Math.min(100, status.volume + step * 5)))
          )
      },
      {
        label: 'Shuffle',
        detail: shuffle ? 'On, when a playlist starts' : 'Off',
        adjust: () => {
          shuffle = !shuffle;
          void page.refresh();
        },
        run: () => {
          shuffle = !shuffle;
          void page.refresh();
        }
      }
    );
    const play = (s: MusicSource) => () =>
      page.run(`Starting ${s.name}…`, async () => {
        await forma.music.play(s.id, { shuffle: s.kind !== 'radio' && Boolean(shuffle) });
        return `Playing ${s.name}`;
      });
    const lists = sources.filter((s) => s.kind !== 'radio');
    const radios = sources.filter((s) => s.kind === 'radio');
    lists.forEach((s, i) =>
      rows.push({
        heading: i === 0 ? 'Folders and playlists' : undefined,
        label: s.name,
        detail: `${s.tracks} ${s.tracks === 1 ? 'track' : 'tracks'}${status.source?.id === s.id ? ' · playing' : ''}`,
        run: play(s)
      })
    );
    radios.forEach((s, i) =>
      rows.push({
        heading: i === 0 ? 'Web radios' : undefined,
        label: s.name,
        detail: status.source?.id === s.id ? 'Playing' : '',
        run: play(s),
        alt: {
          label: 'Remove',
          run: () =>
            page.run('Removing…', async () => {
              await forma.music.removeRadio(s.id.slice('radio:'.length));
              return `${s.name} removed`;
            })
        }
      })
    );
    rows.push({
      heading: radios.length === 0 ? 'Web radios' : undefined,
      label: 'Add a web radio…',
      detail: 'A stream address, like https://ice1.somafm.com/groovesalad-128-mp3',
      run: async () => {
        const name = await page.ask({ title: 'Radio name' });
        if (!name?.trim()) return;
        const url = await page.ask({ title: `Address of ${name.trim()}`, value: 'https://' });
        if (!url?.trim()) return;
        await page.run('Adding…', async () => {
          await forma.music.addRadio(name, url);
          return `${name.trim()} added`;
        });
      }
    });
    return rows;
  };
}

export function nowPlaying(status: MusicStatus): string {
  if (status.state === 'stopped' || !status.source) return 'Nothing playing';
  return status.title ?? status.source.name;
}

function playingDetail(status: MusicStatus): string {
  if (status.state === 'stopped' || !status.source) return 'Pick something below';
  return [
    status.state === 'paused' ? 'Paused' : null,
    status.artist,
    status.source.name,
    status.track !== null && status.tracks !== null ? `${status.track}/${status.tracks}` : null
  ]
    .filter(Boolean)
    .join(' · ');
}

const RA = 'global.retroachievements';

/** RetroAchievements: the account, and what Batocera's RetroArch does with it. */
export function retroAchievementsScreen(forma: Forma, page: Page): () => Promise<Row[]> {
  return async () => {
    const all = await forma.batocera.settings(RA);
    const get = (key: string) => all.find((s) => s.key === key);
    const user = get(`${RA}.username`)?.value;
    const signedIn = Boolean(user && get(`${RA}.token`)?.set);
    const apiKey = await forma.settings.getSystem<string>('ra.apiKey').catch(() => null);

    const rows: Row[] = [
      signedIn
        ? {
            label: `Signed in as ${user}`,
            detail: 'A: sign out',
            run: () =>
              page.run('Signing out…', async () => {
                await forma.ra.logout();
                return 'Signed out of RetroAchievements';
              })
          }
        : {
            label: 'Sign in…',
            detail: 'Your retroachievements.org account',
            run: async () => {
              const name = await page.ask({
                title: 'RetroAchievements username',
                value: user ?? ''
              });
              if (!name?.trim()) return;
              const password = await page.ask({
                title: `Password for ${name.trim()}`,
                secret: true
              });
              if (!password) return;
              await page.run('Signing in…', async () => {
                const who = await forma.ra.login(name, password);
                return `Signed in as ${who}`;
              });
            }
          },
      switchRow(forma, page, get(RA), 'Achievements', 'Earn them while you play')
    ];
    for (const [key, label, detail] of [
      ['hardcore', 'Hardcore mode', 'No save states, rewind or cheats; counts double'],
      ['encore', 'Encore mode', 'Unlock achievements you already have again'],
      ['leaderboards', 'Leaderboards', 'Submit scores and times'],
      ['richpresence', 'Rich presence', 'Show what you are doing on your profile'],
      ['unofficial', 'Unofficial achievements', 'Include ones still being tested'],
      ['challenge_indicators', 'Challenge indicators', 'Show an icon while a challenge is active'],
      ['screenshot', 'Screenshot on unlock', ''],
      ['verbose', 'Verbose messages', 'More notifications from RetroArch']
    ] as const) {
      const setting = get(`${RA}.${key}`);
      if (setting) rows.push(switchRow(forma, page, setting, label, detail));
    }
    const sound = get(`${RA}.sound`);
    if (sound) rows.push(choiceRow(forma, page, sound, 'Unlock sound', (v) => v ?? 'none'));
    rows.push({
      heading: 'Forma',
      label: 'Web API key',
      detail: apiKey
        ? 'Set (for your profile and progress in Forma)'
        : 'retroachievements.org → Settings → Keys; shows your profile and progress in Forma',
      run: async () => {
        const key = await page.ask({ title: 'RetroAchievements web API key', secret: true });
        if (key === null) return;
        await page.run('Saving…', async () => {
          await forma.settings.setSystem('ra.apiKey', key.trim() || null);
          return key.trim() ? 'Web API key saved' : 'Web API key removed';
        });
      }
    });
    return rows;
  };
}

const RELAYS: Record<string, string> = {
  none: 'Off (direct connection)',
  nyc: 'New York',
  madrid: 'Madrid',
  montreal: 'Montreal',
  saopaulo: 'São Paulo',
  custom: 'Custom server'
};

const NP = 'global.netplay';

/** Netplay: on or off, how others see and reach this box. */
export function netplayScreen(forma: Forma, page: Page): () => Promise<Row[]> {
  return async () => {
    const all = await forma.batocera.settings(NP);
    const get = (key: string) => all.find((s) => s.key === key);
    const text = (
      setting: BatoceraSetting | undefined,
      label: string,
      detail: string,
      layout?: 'address'
    ): Row[] =>
      setting
        ? [
            {
              label,
              detail: setting.value ?? detail,
              run: async () => {
                const value = await page.ask({ title: label, value: setting.value ?? '', layout });
                if (value === null) return;
                await page.run('Saving…', async () => {
                  await forma.batocera.set(setting.key, value);
                });
              }
            }
          ]
        : [];
    const relay = get(`${NP}.relay`);
    return [
      switchRow(forma, page, get(NP), 'Netplay', 'Play online with others, through RetroArch'),
      ...text(get(`${NP}.nickname`), 'Nickname', 'Not set: how others see you'),
      ...text(get(`${NP}.port`), 'Port', '55435', 'address'),
      ...(relay
        ? [choiceRow(forma, page, relay, 'Relay server', (v) => RELAYS[v ?? 'none'] ?? v ?? '')]
        : []),
      ...(relay?.value === 'custom'
        ? text(get(`${NP}.customserver`), 'Custom server', 'Not set')
        : [])
    ];
  };
}

function switchRow(
  forma: Forma,
  page: Page,
  setting: BatoceraSetting | undefined,
  label: string,
  detail: string
): Row {
  if (!setting) return { label, detail: 'Not available' };
  const flip = () =>
    page.run('Saving…', async () => {
      await forma.batocera.set(setting.key, setting.value === '1' ? '0' : '1');
    });
  return { label: `${label}: ${onOff(setting.value)}`, detail, run: flip, adjust: flip };
}

function choiceRow(
  forma: Forma,
  page: Page,
  setting: BatoceraSetting,
  label: string,
  show: (value: string | null) => string
): Row {
  const choices = setting.choices;
  const at = Math.max(0, choices.indexOf(setting.value ?? choices[0] ?? ''));
  const pick = (step: -1 | 1) => {
    const next = choices[(at + step + choices.length) % choices.length];
    if (next === undefined) return;
    return page.run('Saving…', async () => {
      await forma.batocera.set(setting.key, next);
    });
  };
  return { label, detail: show(setting.value), adjust: pick, run: () => pick(1) };
}

/** Interface: which theme, where Forma opens, and Cyber's look and order. */
export function interfaceScreen(
  forma: Forma,
  page: Page,
  prefs: () => Prefs,
  change: (update: Partial<Prefs>) => Promise<void>,
  margins: { get: () => number; set: (value: number) => Promise<void> }
): () => Promise<Row[]> {
  const cycle = <T extends string>(values: readonly T[], now: T, step: -1 | 1): T =>
    values[(values.indexOf(now) + step + values.length) % values.length]!;
  const choice = <K extends keyof Prefs>(
    key: K,
    label: string,
    values: readonly (Prefs[K] & string)[],
    names: Record<string, string>,
    detail = ''
  ): Row => {
    const now = prefs()[key] as Prefs[K] & string;
    const pick = (step: -1 | 1) =>
      change({ [key]: cycle(values, now, step) }).then(() => page.refresh());
    return {
      label: `${label}: ${names[now] ?? now}`,
      detail,
      adjust: pick,
      run: () => pick(1)
    };
  };
  const toggle = (key: keyof Prefs, label: string, detail: string): Row => {
    const flip = () => change({ [key]: !prefs()[key] }).then(() => page.refresh());
    return { label: `${label}: ${prefs()[key] ? 'On' : 'Off'}`, detail, run: flip, adjust: flip };
  };

  return async () => {
    const [themes, views, home] = await Promise.all([
      forma.themes.list(),
      forma.nav.views(),
      forma.nav.defaultView()
    ]);
    const rows: Row[] = themes.map((t, i) => ({
      heading: i === 0 ? 'Theme' : undefined,
      label: `${t.name ?? t.id}${t.version ? ` ${t.version}` : ''}`,
      detail: t.current
        ? 'In use'
        : t.unavailable
          ? `Cannot load: ${t.unavailable}`
          : t.origin === 'bundled'
            ? 'Comes with Forma · A to use it'
            : 'Installed · A to use it',
      run:
        t.current || t.unavailable
          ? undefined
          : () => page.run(`Switching to ${t.name ?? t.id}…`, () => forma.themes.select(t.id))
    }));
    const viewIds = views.map((v) => v.id);
    const startOn = home.id ?? 'systems';
    const pickView = (step: -1 | 1) =>
      page.run('Saving…', () => forma.nav.setDefaultView(cycle(viewIds, startOn, step)));
    rows.push({
      label: `Start on: ${startOn === 'systems' ? 'Categories' : (views.find((v) => v.id === startOn)?.name ?? startOn)}`,
      detail: 'What Forma opens on',
      adjust: pickView,
      run: () => pickView(1)
    });
    const nudge = (step: -1 | 1) =>
      margins.set(Math.min(10, Math.max(0, margins.get() + step))).then(() => page.refresh());
    rows.push(
      {
        heading: 'Screen',
        label: `Screen margins: ${margins.get()}%`,
        detail: 'If the TV cuts the edges off; or set the TV to “Just Scan” / “Screen Fit”',
        adjust: nudge,
        run: () => nudge(1)
      },
      {
        ...choice('textSize', 'Text size', ['small', 'normal', 'large'], {
          small: 'Small',
          normal: 'Normal',
          large: 'Large'
        }),
        heading: 'Look'
      },
      choice(
        'board',
        'Circuit board',
        ['on', 'dim', 'off'],
        { on: 'On', dim: 'Dimmed', off: 'Off' },
        'The system’s board behind the screens'
      ),
      toggle('motion', 'Animations', 'Pulsing traces, loaders'),
      toggle('previews', 'Video previews', 'In a game list, after a moment on a game'),
      toggle('nowPlaying', 'Now playing', 'The song in the header'),
      toggle('rotateFacts', 'Rotate curiosities', 'On a system’s page, every 10 seconds'),
      {
        ...choice(
          'systemsSort',
          'Systems',
          ['games', 'name', 'year', 'maker'],
          { games: 'Most games first', name: 'By name', year: 'Oldest first', maker: 'By maker' },
          'In each category'
        ),
        heading: 'Sorting'
      }
    );
    return rows;
  };
}
