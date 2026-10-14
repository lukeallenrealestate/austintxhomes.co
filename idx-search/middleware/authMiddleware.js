const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  });
}

/**
 * Server-to-server authentication for internal endpoints that expose
 * MlgCanView=false listings, comp analysis, and other data that would
 * violate MLS compliance if exposed publicly. Only Realtor-OS (and other
 * server-side consumers Luke runs) should call these endpoints.
 *
 * Expects header: X-Internal-API-Key: <shared secret>
 * The secret is INTERNAL_API_KEY in both idx-search's .env and Realtor-OS's
 * Render env vars. Rotation is just: regenerate, update both sides.
 *
 * If INTERNAL_API_KEY is unset, this middleware refuses everything — fail
 * closed, so a forgotten env var never leaks data to the public internet.
 */
function requireInternalKey(req, res, next) {
  const configured = process.env.INTERNAL_API_KEY;
  if (!configured) {
    return res.status(503).json({ error: 'Internal API not configured on this server' });
  }
  const supplied = req.headers['x-internal-api-key'];
  if (!supplied || supplied !== configured) {
    return res.status(401).json({ error: 'Invalid internal API key' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireInternalKey };
