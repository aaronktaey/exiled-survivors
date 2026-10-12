import { GAME_HEIGHT, JOYSTICK, SETTINGS_RANGE, STORAGE } from '@/config';

/** Everything the options screen can change, as it is stored. */
export interface GameSettings {
  /** Multiplies the thumb stick's radii. */
  joystickScale: number;
  /** Where the stick's centre sits, in screen px. */
  joystickX: number;
  joystickY: number;
  /** Steer by tilting the device instead of dragging the stick. */
  tiltEnabled: boolean;
  bgmVolume: number;
}

const DEFAULTS: GameSettings = {
  joystickScale: 1,
  joystickX: JOYSTICK.margin,
  joystickY: GAME_HEIGHT - JOYSTICK.margin,
  tiltEnabled: false,
  bgmVolume: 0.35,
};

type Listener = (settings: GameSettings) => void;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Player options, persisted in localStorage.
 *
 * Storage can throw or be empty (private windows, blocked site data), so
 * every read falls back to the defaults and every write is allowed to fail
 * quietly — settings are a convenience, not state the game needs.
 */
class SettingsStore {
  private current: GameSettings = { ...DEFAULTS };
  private readonly listeners = new Set<Listener>();
  private loaded = false;

  public get value(): GameSettings {
    if (!this.loaded) {
      this.load();
    }
    return this.current;
  }

  public get defaults(): GameSettings {
    return { ...DEFAULTS };
  }

  public update(patch: Partial<GameSettings>): GameSettings {
    this.current = this.sanitise({ ...this.value, ...patch });
    this.save();
    this.listeners.forEach((listener) => listener(this.current));
    return this.current;
  }

  public reset(): GameSettings {
    return this.update(DEFAULTS);
  }

  /** Steps a numeric setting by its configured increment. */
  public step(key: 'joystickScale' | 'bgmVolume', direction: -1 | 1): GameSettings {
    const range = SETTINGS_RANGE[key];
    const next = this.value[key] + range.step * direction;
    // Round to the step, or floating point turns 0.7 into 0.7000000000000001.
    const snapped = Math.round(next / range.step) * range.step;
    return this.update({ [key]: clamp(snapped, range.min, range.max) });
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private load(): void {
    this.loaded = true;
    try {
      const raw = window.localStorage.getItem(STORAGE.settings);
      if (raw) {
        this.current = this.sanitise({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<GameSettings>) });
      }
    } catch {
      this.current = { ...DEFAULTS };
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE.settings, JSON.stringify(this.current));
    } catch {
      // Nothing to do: the run continues with the settings held in memory.
    }
  }

  /** Keeps a hand-edited or stale payload from putting the stick off-screen. */
  private sanitise(raw: GameSettings): GameSettings {
    const scale = SETTINGS_RANGE.joystickScale;
    const volume = SETTINGS_RANGE.bgmVolume;
    return {
      joystickScale: clamp(Number(raw.joystickScale) || 1, scale.min, scale.max),
      joystickX: Math.round(clamp(Number(raw.joystickX) || DEFAULTS.joystickX, 0, 4096)),
      joystickY: Math.round(clamp(Number(raw.joystickY) || DEFAULTS.joystickY, 0, 4096)),
      tiltEnabled: raw.tiltEnabled === true,
      bgmVolume: clamp(Number(raw.bgmVolume ?? DEFAULTS.bgmVolume), volume.min, volume.max),
    };
  }
}

export const settings = new SettingsStore();
