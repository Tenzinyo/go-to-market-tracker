import { pipeline, env } from '@xenova/transformers'

// Don't look for local models — fetch from HuggingFace Hub and cache in IndexedDB
env.allowLocalModels = false

let transcriber = null

self.onmessage = async ({ data }) => {
  if (data.type !== 'transcribe') return

  try {
    if (!transcriber) {
      self.postMessage({ type: 'status', text: 'Downloading speech model (~40MB, once only)…' })
      transcriber = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-tiny.en',
        { quantized: true }
      )
    }
    self.postMessage({ type: 'status', text: 'Transcribing…' })
    const result = await transcriber(data.audio, {
      language: 'english',
      task: 'transcribe',
      return_timestamps: false,
    })
    self.postMessage({ type: 'result', text: result.text.trim() })
  } catch (err) {
    self.postMessage({ type: 'error', text: err.message })
  }
}
