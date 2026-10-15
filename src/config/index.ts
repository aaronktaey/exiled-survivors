/**
 * Configuration, split by what you would be looking for:
 *
 *   balance.ts   — ★ how the game plays: health, damage, speeds, drop
 *                  rates, every skill's stat line and what an upgrade adds.
 *   equipment.ts — ★ 장비: the roster, and how often one drops.
 *   passives.ts  — ★ 패시브: the tree, and the currency that buys it.
 *   visuals.ts — how it looks: colours, textures, depth, HUD and menu layout.
 *   system.ts  — how it is wired: canvas size, scene keys, storage keys,
 *                frame pacing, asset paths.
 *
 * Everything is re-exported here, so the rest of the game keeps importing
 * from '@/config' and never has to care which file a constant lives in.
 */
export * from '@/config/balance';
export * from '@/config/bones';
export * from '@/config/equipment';
export * from '@/config/passives';
export * from '@/config/visuals';
export * from '@/config/system';
export * from '@/config/itemFilter';
