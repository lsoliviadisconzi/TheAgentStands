// Main entry point - re-exports all TTS modules
// This provides a clean API for using the TTS functionality standalone

export * from './tts-types';
export * from './tts-config';
export * from './tts-client';
export * from './tts-route';

/**
 * Quick start example:
 * 
 * import { createTtsRoute, createVoicesRoute, listVoices, speak } from './tts-extract';
 * 
 * // In your Express app:
 * app.get('/api/tts/voices', createVoicesRoute(listVoices));
 * app.post('/api/reels/:id/lines/:lineId/tts', createTtsRoute(
 *   getReel, updateReel, lineKey, serialize, DATA_DIR, MEDIA_URL,
 *   listVoices, speak, probeDurationMs
 * ));
 * 
 * // Or use directly:
 * const voices = await listVoices();
 * const voice = voices.voices.find(v => v.id === 'my-voice');
 * if (voice) {
 *   const audioBuffer = await speak('Hello world', voice);
 *   // Save audioBuffer to file...
 * }
 */