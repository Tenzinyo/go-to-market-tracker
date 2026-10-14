/**
 * routes/attachments.js
 *
 * POST   /api/attachments            — upload file (multipart/form-data)
 * GET    /api/attachments            — list for entity (?entity_type=&entity_id=)
 * GET    /api/attachments/:id/file   — download / serve file
 * DELETE /api/attachments/:id        — soft delete
 */

const router  = require('express').Router();
const db      = require('../db/db');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

// ── Upload directory ──────────────────────────────────────────────────────────

const UPLOAD_DIR = path.join(
  process.env.DATA_DIR || path.join(__dirname, '../../data'),
  'uploads'
);
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Multer config ─────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file,  cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const uuid = crypto.randomUUID();
    cb(null, `${uuid}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

// ── POST /api/attachments ─────────────────────────────────────────────────────

router.post('/', upload.single('file'), (req, res) => {
  const { entity_type, entity_id } = req.body;

  if (!req.file)    return res.status(400).json({ error: 'No file uploaded' });
  if (!entity_type) return res.status(400).json({ error: 'entity_type is required' });
  if (!entity_id)   return res.status(400).json({ error: 'entity_id is required' });

  const VALID_TYPES = ['account', 'deal', 'entry', 'contact'];
  if (!VALID_TYPES.includes(entity_type)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: `Invalid entity_type: ${entity_type}` });
  }

  const uploadedBy = req.currentUser?.id ?? null;

  const info = db.prepare(`
    INSERT INTO attachments (entity_type, entity_id, filename, original_name, size, mime_type, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    entity_type,
    String(entity_id),
    req.file.filename,
    req.file.originalname,
    req.file.size,
    req.file.mimetype ?? null,
    uploadedBy,
  );

  const attachment = db.prepare(`
    SELECT a.*, u.display_name AS uploaded_by_name
    FROM attachments a
    LEFT JOIN users u ON a.uploaded_by = u.id
    WHERE a.id = ?
  `).get(info.lastInsertRowid);

  res.status(201).json({ ok: true, attachment });
});

// ── GET /api/attachments ──────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const { entity_type, entity_id } = req.query;
  if (!entity_type || !entity_id) {
    return res.status(400).json({ error: 'entity_type and entity_id are required' });
  }

  const attachments = db.prepare(`
    SELECT a.*, u.display_name AS uploaded_by_name
    FROM attachments a
    LEFT JOIN users u ON a.uploaded_by = u.id
    WHERE a.entity_type = ? AND a.entity_id = ? AND a.deleted_at IS NULL
    ORDER BY a.created_at DESC
  `).all(entity_type, String(entity_id));

  res.json({ ok: true, attachments });
});

// ── GET /api/attachments/:id/file ─────────────────────────────────────────────

router.get('/:id/file', (req, res) => {
  const attachment = db.prepare(`
    SELECT * FROM attachments WHERE id = ? AND deleted_at IS NULL
  `).get(req.params.id);

  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  const filePath = path.join(UPLOAD_DIR, attachment.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${attachment.original_name}"`);
  if (attachment.mime_type) res.setHeader('Content-Type', attachment.mime_type);
  res.sendFile(filePath);
});

// ── DELETE /api/attachments/:id ───────────────────────────────────────────────

router.delete('/:id', (req, res) => {
  const attachment = db.prepare(`
    SELECT * FROM attachments WHERE id = ? AND deleted_at IS NULL
  `).get(req.params.id);

  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  // Soft delete the DB record
  db.prepare(`UPDATE attachments SET deleted_at = datetime('now') WHERE id = ?`).run(req.params.id);

  // Also remove the file from disk
  const filePath = path.join(UPLOAD_DIR, attachment.filename);
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}

  res.json({ ok: true });
});

module.exports = router;
