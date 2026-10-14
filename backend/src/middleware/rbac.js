/**
 * middleware/rbac.js
 *
 * attachUser  — reads X-User-Id header, attaches req.currentUser (role included)
 * requireRole — factory that returns a middleware blocking requests below minRole
 *
 * Role hierarchy: rep (1) < manager (2) < admin (3)
 * If no user ID is provided the request is treated as rep-level (least privileged).
 */

const db = require('../db/db');

const ROLE_LEVEL = { rep: 1, manager: 2, admin: 3 };

function attachUser(req, _res, next) {
  const userId = req.headers['x-user-id'];
  if (userId) {
    const user = db.prepare(`SELECT id, display_name, role FROM users WHERE id = ?`).get(Number(userId));
    req.currentUser = user ?? null;
  } else {
    req.currentUser = null;
  }
  next();
}

function requireRole(minRole) {
  const minLevel = ROLE_LEVEL[minRole] ?? 1;
  return (req, res, next) => {
    const role  = req.currentUser?.role ?? 'rep';
    const level = ROLE_LEVEL[role] ?? 1;
    if (level < minLevel) {
      return res.status(403).json({
        error: `Insufficient permissions. Required: ${minRole}, your role: ${role}`,
      });
    }
    next();
  };
}

module.exports = { attachUser, requireRole };
