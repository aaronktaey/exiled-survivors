/**
 * Configuration, split by what you would be looking for:
 *
 *   balance.ts — ★ how the game plays: health, damage, speeds, drop rates,
 *                every skill's stat line and what an upgrade adds to it.
 *   visuals.ts — how it looks: colours, textures, depth, HUD and menu layout.
 *   system.ts  — how it is wired: canvas size, scene keys, storage keys,
 *                frame pacing, asset paths.
 *
 * Everything is re-exported here, so the rest of the game keeps importing
 * from '@/config' and never has to care which file a constant lives in.
 */
export * from '@/config/balance';
export * from '@/config/visuals';
export * from '@/config/system';
