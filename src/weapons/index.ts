/**
 * Weapons: one file per weapon (bolt, whip, garlic aura, ...).
 * A weapon owns its cooldown, scaling and how it spawns hitboxes.
 */
export { BoltWeapon } from '@/weapons/BoltWeapon';
export { findNearest, type Weapon, type WeaponContext } from '@/weapons/Weapon';
