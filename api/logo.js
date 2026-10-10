import {
  method,
  idParam,
  cache,
  error
} from './_lib/http.js';

import { paprika } from './_lib/providers.js';

const logoCache = new Map();
const LOGO_CACHE_TTL = 24 * 60 * 60 * 1000;
const ALLOWED_LOGO_HOST = 'static.coinpaprika.com';

export default async function handler(req, res) {
  if (!method(req, res)) return;

  try {
    const id = idParam(req.query.id);
    const cached = logoCache.get(id);

    let logoUrl;

    if (cached && Date.now() - cached.savedAt < LOGO_CACHE_TTL) {
      logoUrl = cached.url;
    } else {
      const coin = await paprika(`/coins/${encodeURIComponent(id)}`);

      if (!coin.logo) {
        return res.status(404).end();
      }

      const parsedLogo = new URL(coin.logo);

      if (
        parsedLogo.protocol !== 'https:' ||
        parsedLogo.hostname !== ALLOWED_LOGO_HOST
      ) {
        return res.status(502).end();
      }

      logoUrl = parsedLogo.toString();

      if (logoCache.size >= 1000) {
        const oldestId = logoCache.keys().next().value;
        if (oldestId) logoCache.delete(oldestId);
      }

      logoCache.set(id, {
        url: logoUrl,
        savedAt: Date.now()
      });
    }

    cache(res, 86400, 259200);
    res.setHeader('Location', logoUrl);
    return res.status(302).end();
  } catch (err) {
    return error(res, err);
  }
}
