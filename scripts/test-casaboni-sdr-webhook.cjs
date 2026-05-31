const dotenv = require('dotenv');
(async () => {
  dotenv.config({ path: '.env.local', override: true });
  const webhookUrl =
    process.env.N8N_SDR_WEBHOOK_URL ||
    process.env.N8N_RAG_WEBHOOK_URL?.replace('/casaboni-rag-query', '/casaboni-sdr-agent') ||
    new URL('/webhook/casaboni-sdr-agent', process.env.N8N_API_URL).toString();
  const basePayload = {
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    ragWebhookUrl: process.env.N8N_RAG_WEBHOOK_URL,
    driveFolderId: process.env.N8N_DRIVE_FOLDER_ID,
    firebase: {
      apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyDt0kyR-e6vTyMIPeCfxusPDedv6RnxcLs',
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0033143716',
      databaseId: process.env.VITE_FIREBASE_DATABASE_ID || 'ai-studio-f582f4de-81c3-4a0f-84f5-9a75b5fd666e'
    }
  };
  async function test(name, payload) {
    const response = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...basePayload, ...payload }) });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    console.log('\n## ' + name);
    console.log(JSON.stringify({ status: response.status, ok: data.ok, source: data.source, reply: data.reply, followUp: data.followUp, mediaCount: Array.isArray(data.media) ? data.media.length : 0, leadSaved: data.leadSaved, error: data.error }, null, 2));
  }
  await test('saudacao', { message: 'oi tudo bem?', history: [], sessionId: 'n8n-sdr-test-1' });
  await test('fotos pisos', { message: 'você tem fotos dos pisos modernos?', history: [], sessionId: 'n8n-sdr-test-2' });
  await test('lead', { message: 'meu nome é Carlos Mendes e meu whatsapp é 11999999999', history: [{ role: 'user', text: 'quero piso para sala de 20m2 estilo claro' }], sessionId: 'n8n-sdr-test-' + Date.now() });
  console.log('\nwebhook=' + webhookUrl);
})().catch((error) => { console.error(error.message); process.exit(1); });
