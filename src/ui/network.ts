import type {
  EthernetConfig,
  Forma,
  InputEvent,
  NetworkStatus,
  WifiNetwork
} from '@ramraiders/forma-sdk';
import { FormaError } from '@ramraiders/forma-sdk';

import { moveList } from '../logic/nav.js';
import { el } from './dom.js';
import { Keyboard } from './keyboard.js';

interface Row {
  label: string;
  detail?: string;
  run?: () => unknown;
}

type Page = 'main' | 'ethernet';

/** Restarting connman takes a few seconds; status read before then is the old one. */
const SETTLE_MS = 4000;

/** Wi-Fi and Ethernet, from the system menu. */
export class NetworkScreen {
  readonly keyboard = new Keyboard();
  readonly root = el('div', { class: 'overlay switcher network', hidden: '' });
  #page: Page = 'main';
  #rows: Row[] = [];
  #selected = 0;
  #status: NetworkStatus | null = null;
  #networks: WifiNetwork[] = [];
  #scanning = false;
  /** What is running right now (joining, saving…), shown instead of the rows. */
  #busy: string | null = null;
  #error: string | null = null;
  /** The static address being edited, before it is saved. */
  #draft: Extract<EthernetConfig, { method: 'manual' }> | null = null;

  constructor(
    private readonly forma: Forma,
    private readonly notify: (message: string) => void,
    /** After every change on screen, so the button hints can follow. */
    private readonly changed: () => void
  ) {}

  get open(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.#page = 'main';
    this.#selected = 0;
    this.root.hidden = false;
    void this.#refresh(true);
  }

  close(): void {
    this.root.hidden = true;
    this.changed();
  }

  hints(): [string, string][] {
    if (this.keyboard.open) return this.keyboard.hints();
    if (this.#busy) return [];
    return [
      ['A', 'Choose'],
      ...(this.#page === 'main' && this.#status?.wifi?.enabled
        ? [['Y', 'Scan again'] as [string, string]]
        : []),
      ['B', this.#page === 'main' ? 'Close' : 'Back']
    ];
  }

  input(e: InputEvent): void {
    if (this.keyboard.open) return this.keyboard.input(e);
    if (!e.pressed || this.#busy) return;
    if (e.action === 'up' || e.action === 'down') {
      // Only the highlight moves: a rebuild would flicker on every press (see Page).
      const items = this.root.querySelectorAll('li[role=option]');
      items[this.#selected]?.classList.remove('selected');
      this.#selected = moveList(this.#selected, this.#rows.length, e.action, 5, e.repeat);
      items[this.#selected]?.classList.add('selected');
      items[this.#selected]?.scrollIntoView({ block: 'nearest' });
      return this.changed();
    }
    if (e.repeat) return;
    switch (e.action) {
      case 'confirm':
        return void this.#rows[this.#selected]?.run?.();
      case 'north':
        if (this.#page === 'main') void this.#scan();
        return;
      case 'back':
        if (this.#page === 'main') return this.close();
        this.#page = 'main';
        this.#selected = 0;
        return this.#render();
      default:
    }
  }

  async #refresh(scan: boolean): Promise<void> {
    try {
      this.#status = await this.forma.network.status();
      this.#error = null;
    } catch (error) {
      this.#status = null;
      this.#error = FormaError.from(error).message;
    }
    this.#render();
    if (scan && this.#status?.wifi?.enabled) await this.#scan();
  }

  async #scan(): Promise<void> {
    if (this.#scanning) return;
    this.#scanning = true;
    this.#render();
    try {
      this.#networks = await this.forma.network.wifiScan();
    } catch (error) {
      this.notify(FormaError.from(error).message);
    } finally {
      this.#scanning = false;
      this.#render();
    }
  }

  /** Runs a change with the screen showing `label`, then reads the status again. */
  async #change(label: string, work: () => Promise<string | void>, settle = 0): Promise<void> {
    this.#busy = label;
    this.#render();
    try {
      const done = await work();
      if (settle) await new Promise((r) => setTimeout(r, settle));
      if (done) this.notify(done);
    } catch (error) {
      this.notify(FormaError.from(error).message);
    } finally {
      this.#busy = null;
      await this.#refresh(this.#page === 'main');
    }
  }

  async #join(network: { ssid: string; security: WifiNetwork['security'] | null }): Promise<void> {
    if (network.security === 'enterprise') {
      this.notify(`${network.ssid} needs 802.1X, which Batocera's Wi-Fi settings cannot set up`);
      return;
    }
    let passphrase: string | undefined;
    if (network.security !== 'open') {
      const typed = await this.keyboard.ask({
        title: `Password for ${network.ssid}`,
        secret: true
      });
      this.#render();
      if (typed === null) return;
      passphrase = typed;
    }
    await this.#change(`Connecting to ${network.ssid}…`, async () => {
      const joined = await this.forma.network.joinWifi(network.ssid, passphrase);
      return joined === 'connected'
        ? `Connected to ${network.ssid}`
        : `${network.ssid} is saved. The cable stays in use; unplug it to use Wi-Fi`;
    });
  }

  async #joinOther(): Promise<void> {
    const ssid = await this.keyboard.ask({ title: 'Network name' });
    this.#render();
    if (ssid?.trim()) await this.#join({ ssid: ssid.trim(), security: null });
  }

  #mainRows(): Row[] {
    const wifi = this.#status?.wifi;
    const rows: Row[] = [];
    if (this.#status?.ethernet) {
      rows.push({
        label: 'Ethernet',
        detail: describeEthernet(this.#status),
        run: () => {
          this.#page = 'ethernet';
          this.#selected = 0;
          this.#draft = null;
          this.#render();
        }
      });
    }
    if (!wifi) return rows;
    rows.push({
      label: `Wi-Fi: ${wifi.enabled ? 'on' : 'off'}`,
      detail: describeWifi(this.#status!),
      run: () =>
        this.#change(
          wifi.enabled ? 'Turning Wi-Fi off…' : 'Turning Wi-Fi on…',
          () => this.forma.network.setWifiEnabled(!wifi.enabled),
          wifi.enabled ? 0 : SETTLE_MS
        )
    });
    if (!wifi.enabled) return rows;
    if (this.#scanning && this.#networks.length === 0) {
      rows.push({ label: 'Looking for networks…' });
    }
    for (const n of this.#networks) {
      const marks = [
        n.connected ? 'connected' : n.saved ? 'saved' : '',
        n.security === 'open' ? 'open' : n.security === 'enterprise' ? '802.1X' : ''
      ].filter(Boolean);
      rows.push({
        label: `${bars(n.strength)}  ${n.ssid}`,
        detail: marks.join(' · '),
        run: () => this.#join(n)
      });
    }
    rows.push({
      label: 'Other network…',
      detail: 'A hidden network, by name',
      run: () => this.#joinOther()
    });
    return rows;
  }

  #ethernetRows(): Row[] {
    const saved = this.#status?.ethernet?.config ?? { method: 'dhcp' };
    const draft = this.#draft;
    const rows: Row[] = [
      {
        label: `${draft ? '○' : '●'} Automatic (DHCP)`,
        detail: 'The router gives the box its address',
        run: () => {
          if (saved.method === 'dhcp' && !draft) return;
          void this.#change(
            'Switching to an automatic address…',
            async () => {
              await this.forma.network.configureEthernet({ method: 'dhcp' });
              this.#draft = null;
              return 'Ethernet uses an automatic address';
            },
            SETTLE_MS
          );
        }
      },
      {
        label: `${draft ? '●' : '○'} Manual`,
        detail: 'A fixed address, kept across reboots',
        run: () => {
          if (draft) return;
          const now = this.#status?.ethernet?.ipv4;
          this.#draft =
            saved.method === 'manual'
              ? structuredClone(saved)
              : {
                  method: 'manual',
                  address: now?.address ?? '',
                  netmask: now?.netmask ?? '255.255.255.0',
                  gateway: now?.gateway ?? '',
                  nameservers: this.#status?.ethernet?.nameservers.slice(0, 1) ?? []
                };
          this.#render();
        }
      }
    ];
    if (!draft) return rows;
    const field = (label: string, value: string, set: (v: string) => void): Row => ({
      label,
      detail: value || '—',
      run: async () => {
        const typed = await this.keyboard.ask({ title: label, value, layout: 'address' });
        if (typed !== null) set(typed.trim());
        this.#render();
      }
    });
    rows.push(
      field('Address', draft.address, (v) => (draft.address = v)),
      field('Netmask', draft.netmask, (v) => (draft.netmask = v)),
      field('Gateway', draft.gateway ?? '', (v) => (draft.gateway = v || null)),
      field('DNS server', draft.nameservers[0] ?? '', (v) => (draft.nameservers = v ? [v] : [])),
      {
        label: 'Save',
        detail: 'The connection drops for a few seconds',
        run: () =>
          this.#change(
            'Saving…',
            async () => {
              await this.forma.network.configureEthernet(draft);
              return `Ethernet uses ${draft.address}`;
            },
            SETTLE_MS
          )
      }
    );
    return rows;
  }

  #render(): void {
    // A saved static address opens as the editable draft.
    const saved = this.#status?.ethernet?.config;
    if (this.#page === 'ethernet' && !this.#draft && saved?.method === 'manual') {
      this.#draft = structuredClone(saved);
    }
    this.#rows =
      this.#busy || this.#error
        ? []
        : this.#page === 'main'
          ? this.#mainRows()
          : this.#ethernetRows();
    // While busy there are no rows; keep the place for when they come back.
    if (this.#rows.length > 0) this.#selected = Math.min(this.#selected, this.#rows.length - 1);
    const title = this.#page === 'main' ? 'Network' : 'Ethernet';
    const note = this.#busy ?? this.#error ?? (this.#status ? null : 'Reading the network…');
    const scrolled = this.root.querySelector('.panel')?.scrollTop ?? 0;
    this.root.replaceChildren(
      el(
        'div',
        { class: 'panel' },
        el('h2', {}, title),
        note ? el('p', { class: 'note' }, note) : null,
        el(
          'ul',
          { role: 'listbox' },
          ...this.#rows.map((row, i) =>
            el(
              'li',
              { role: 'option', class: i === this.#selected ? 'selected' : '' },
              el('span', { class: 'name' }, row.label),
              el('span', { class: 'description' }, row.detail ?? '')
            )
          )
        )
      ),
      this.keyboard.root
    );
    const panel = this.root.querySelector('.panel');
    if (panel) panel.scrollTop = scrolled;
    this.root.querySelector('li.selected')?.scrollIntoView({ block: 'nearest' });
    this.changed();
  }
}

function describeEthernet(status: NetworkStatus): string {
  const e = status.ethernet!;
  const how = e.config.method === 'manual' ? 'fixed address' : 'automatic';
  return e.connected && e.ipv4 ? `${e.ipv4.address} · ${how}` : `No cable · ${how}`;
}

function describeWifi(status: NetworkStatus): string {
  const w = status.wifi!;
  if (!w.enabled) return w.saved ? `${w.saved} is saved; A turns Wi-Fi on` : 'A turns Wi-Fi on';
  if (w.connected) return `Connected to ${w.connected}${w.ipv4 ? ` · ${w.ipv4.address}` : ''}`;
  if (w.saved && status.ethernet?.connected) return `${w.saved} is saved; the cable is in use`;
  return w.saved ? `${w.saved} is saved, not in range` : 'Not connected';
}

/** Signal strength as four bars. */
function bars(strength: number | null): string {
  const n = strength === null ? 0 : Math.ceil(strength / 25);
  return '▮'.repeat(n) + '▯'.repeat(4 - n);
}
