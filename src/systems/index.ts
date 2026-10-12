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
  skillLevelFromStats,
  upgradeOptionsFor,
  type SkillStats,
  type UpgradeId,
  type UpgradeOption,
} from '@/systems/Progression';
export { Hud, type LoadoutEntry } from '@/systems/Hud';
export { VirtualJoystick, prefersTouchControls, type AnalogInput } from '@/systems/VirtualJoystick';
export { TiltInput, tiltAvailable, requestTiltPermission } from '@/systems/TiltInput';
export { MenuList, type MenuItem, type MenuListOptions } from '@/systems/MenuList';
export {
  settings,
  MOVEMENT_MODES,
  type GameSettings,
  type MovementMode,
} from '@/systems/Settings';
export { saveGame, type SavedRun } from '@/systems/SaveGame';
export { bgm } from '@/systems/Bgm';
export { sfx } from '@/systems/Sfx';
export { createPixelTextTexture } from '@/systems/PixelFont';
export { RareTooltip } from '@/systems/RareTooltip';
