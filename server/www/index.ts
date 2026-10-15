/**
 * www.exiledsurvivors.com → exiledsurvivors.com, path and query kept.
 *
 * The game has one address on purpose: localStorage belongs to an origin, and
 * a player who came in on www would otherwise keep a second, separate set of
 * records. A permanent redirect, so browsers and search engines learn it.
 */
const HOME = 'https://exiledsurvivors.com';

export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    return Response.redirect(`${HOME}${url.pathname}${url.search}${url.hash}`, 301);
  },
} satisfies ExportedHandler;
