/**
 * Systems: cross-cutting per-frame logic that operates on many entities —
 * spawn director, combat resolution, progression and HUD.
 */
export { SpawnDirector } from '@/systems/SpawnDirector';
export { CombatSystem } from '@/systems/CombatSystem';
export { Progression, UPGRADES, type UpgradeId, type UpgradeOption } from '@/systems/Progression';
export { Hud } from '@/systems/Hud';
