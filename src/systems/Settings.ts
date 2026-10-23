import { LOCALE, SETTINGS_RANGE, STORAGE } from '@/config';
import { LANGUAGES, detectLanguage, setLanguage, type Language } from '@/i18n';

/**
 * How a touch device steers the survivor. The pad is summoned under
 * whichever finger lands — a pad pinned to one spot asked the player to find
 * it before they could move, which on a phone is a hit they take for free.
 */
export type MovementMode = 'floating' | 'tilt';

export const MOVEMENT_MODES: readonly MovementMode[] = ['floating', 'tilt'];

/** Everything the options screen can change, as it is stored. */
export interface GameSettings {
  /** Multiplies the thumb stick's radii. */
  joystickScale: number;
  /** 'floating' puts a pad under the finger, 'tilt' uses the sensor instead. */
  movementMode: MovementMode;
  bgmVolume: number;
  /** Multiplies every sound effect's own volume. */
  sfxVolume: number;
  /** The numbers that rise off an enemy that is hit (0.101). Heals and notices show either way. */
  damageNumbers: boolean;
  language: Language;
}

const DEFAULTS: GameSettings = {
  joystickScale: 1,
  movementMode: 'floating',
  bgmVolume: 0.35,
  sfxVolume: 1,
  damageNumbers: true,
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
    setLanguage(shownLanguage(this.current.language));
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

  /** Shows or hides the numbers off hits. */
  public toggleDamageNumbers(): GameSettings {
    return this.update({ damageNumbers: !this.value.damageNumbers });
  }

  /** Walks the movement mode round its three options. */
  public cycleMovementMode(direction: -1 | 1): GameSettings {
    const at = MOVEMENT_MODES.indexOf(this.value.movementMode);
    const next = (at + direction + MOVEMENT_MODES.length) % MOVEMENT_MODES.length;
    return this.update({ movementMode: MOVEMENT_MODES[next] });
  }

  /** Steps a numeric setting by its configured increment. */
  public step(key: 'joystickScale' | 'bgmVolume' | 'sfxVolume', direction: -1 | 1): GameSettings {
    const range = SETTINGS_RANGE[key];
    const next = this.value[key] + range.step * direction;
    // Round to the step, or floating point turns 0.7 into 0.7000000000000001.
    const snapped = Number((Math.round(next / range.step) * range.step).toFixed(4));
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

    setLanguage(shownLanguage(this.current.language));
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
    const effects = SETTINGS_RANGE.sfxVolume;
    return {
      joystickScale: clamp(Number(raw.joystickScale) || 1, scale.min, scale.max),
      movementMode: MOVEMENT_MODES.includes(raw.movementMode) ? raw.movementMode : 'floating',
      language: LANGUAGES.includes(raw.language) ? raw.language : DEFAULTS.language,
      bgmVolume: clamp(Number(raw.bgmVolume ?? DEFAULTS.bgmVolume), volume.min, volume.max),
      sfxVolume: clamp(Number(raw.sfxVolume ?? DEFAULTS.sfxVolume), effects.min, effects.max),
      damageNumbers: raw.damageNumbers !== false,
    };
  }
}

export const settings = new SettingsStore();

/**
 * The language the game is shown in: the one chosen, once choosing is on
 * (LOCALE.choosable); until then always LOCALE.fixed. The choice itself is
 * still kept, so nothing is lost when it comes back.
 */
function shownLanguage(chosen: Language): Language {
  return LOCALE.choosable ? chosen : (LOCALE.fixed as Language);
}
