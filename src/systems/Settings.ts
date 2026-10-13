import { JOYSTICK, SETTINGS_RANGE, STORAGE } from '@/config';
import { LANGUAGES, detectLanguage, setLanguage, type Language } from '@/i18n';
import { currentCanvasSize } from '@/systems/Viewport';

/** How a touch device steers the survivor. */
export type MovementMode = 'fixed' | 'floating' | 'tilt';

export const MOVEMENT_MODES: readonly MovementMode[] = ['fixed', 'floating', 'tilt'];

/** Everything the options screen can change, as it is stored. */
export interface GameSettings {
  /** Multiplies the thumb stick's radii. */
  joystickScale: number;
  /** Where the stick's centre sits, in screen px. */
  joystickX: number;
  joystickY: number;
  /**
   * 'fixed' keeps the pad where it was placed, 'floating' puts one under
   * whichever finger touches down, 'tilt' drops the pad for the sensor.
   */
  movementMode: MovementMode;
  bgmVolume: number;
  language: Language;
}

const DEFAULTS: GameSettings = {
  joystickScale: 1,
  joystickX: JOYSTICK.margin,
  // The canvas is sized for the window, so the corner is not a fixed number.
  joystickY: currentCanvasSize().height - JOYSTICK.margin,
  movementMode: 'fixed',
  bgmVolume: 0.35,
  // Nothing stored yet means a first visit: follow the browser.
  language: detectLanguage(),
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

  /**
   * Reads storage and applies the stored language. Called once at boot,
   * before any scene builds text: a screen built under the default and
   * then switched would keep the words it was born with.
   */
  public prime(): void {
    void this.value;
  }

  public get defaults(): GameSettings {
    return { ...DEFAULTS };
  }

  public update(patch: Partial<GameSettings>): GameSettings {
    this.current = this.sanitise({ ...this.value, ...patch });
    setLanguage(this.current.language);
    this.save();
    this.listeners.forEach((listener) => listener(this.current));
    return this.current;
  }

  public reset(): GameSettings {
    return this.update(DEFAULTS);
  }

  /** Walks the language round the list, applying it as it goes. */
  public cycleLanguage(direction: -1 | 1): GameSettings {
    const at = LANGUAGES.indexOf(this.value.language);
    const next = (at + direction + LANGUAGES.length) % LANGUAGES.length;
    return this.update({ language: LANGUAGES[next] });
  }

  /** Walks the movement mode round its three options. */
  public cycleMovementMode(direction: -1 | 1): GameSettings {
    const at = MOVEMENT_MODES.indexOf(this.value.movementMode);
    const next = (at + direction + MOVEMENT_MODES.length) % MOVEMENT_MODES.length;
    return this.update({ movementMode: MOVEMENT_MODES[next] });
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

    setLanguage(this.current.language);
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
      movementMode: MOVEMENT_MODES.includes(raw.movementMode) ? raw.movementMode : 'fixed',
      language: LANGUAGES.includes(raw.language) ? raw.language : DEFAULTS.language,
      bgmVolume: clamp(Number(raw.bgmVolume ?? DEFAULTS.bgmVolume), volume.min, volume.max),
    };
  }
}

export const settings = new SettingsStore();
