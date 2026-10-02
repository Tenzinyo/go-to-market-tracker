/**
 * routes/voice.js
 * POST /api/voice/transcribe — transcribe audio using local whisper.cpp
 */

const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const { nodewhisper } = require('nodejs-whisper');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file provided' });

  const tmpFile = path.join(os.tmpdir(), `whisper-${Date.now()}.webm`);
  fs.writeFileSync(tmpFile, req.file.buffer);

  try {
    const result = await nodewhisper(tmpFile, {
      modelName: 'base.en',
      autoDownloadModelName: 'base.en',
      removeWavFileAfterTranscription: true,
      withCuda: false,
      whisperOptions: {
        outputInText: true,
        outputInVtt: false,
        outputInSrt: false,
        outputInCsv: false,
        language: 'en',
        wordTimestamps: false,
        splitOnWord: true,
      },
    });

    const text = (Array.isArray(result) ? result.map(r => r.speech).join(' ') : String(result)).trim();
    res.json({ ok: true, text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(tmpFile, () => {});
  }
});

module.exports = router;
