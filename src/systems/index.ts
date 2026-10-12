/**
 * Systems: cross-cutting per-frame logic that operates on many entities —
 * spawn director, combat resolution, progression and HUD.
 */
export { SpawnDirector } from '@/systems/SpawnDirector';
export { CombatSystem } from '@/systems/CombatSystem';
export { Separation } from '@/systems/Separation';
export { DamageNumbers } from '@/systems/DamageNumbers';
export { DebugOverlay, type DebugActions, type DebugCounts } from '@/systems/DebugOverlay';
export {
  Progression,
  upgradeOptionsFor,
  type SkillStats,
  type UpgradeId,
  type UpgradeOption,
} from '@/systems/Progression';
export { Hud, type LoadoutEntry } from '@/systems/Hud';
export { VirtualJoystick, prefersTouchControls, type AnalogInput } from '@/systems/VirtualJoystick';
export { TiltInput, tiltAvailable, requestTiltPermission } from '@/systems/TiltInput';
export { MenuList, type MenuItem, type MenuListOptions } from '@/systems/MenuList';
export { settings, type GameSettings } from '@/systems/Settings';
export { saveGame, type SavedRun } from '@/systems/SaveGame';
export { bgm } from '@/systems/Bgm';
export { createPixelTextTexture } from '@/systems/PixelFont';
