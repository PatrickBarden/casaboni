const fs = require('fs');
const dotenv = require('dotenv');
(async () => {
  dotenv.config({ path: '.env.local', override: true });
  const apiUrl = ((process.env.N8N_API_URL || '').replace(/\/$/, '') + '/api/v1');
  const apiKey = process.env.N8N_API_KEY || '';
  if (!apiUrl || !apiKey) throw new Error('N8N_API_URL/N8N_API_KEY ausentes');
  const workflow = JSON.parse(fs.readFileSync('scripts/casaboni-sdr-agent-workflow.json', 'utf8'));
  const response = await fetch(apiUrl + '/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-N8N-API-KEY': apiKey },
    body: JSON.stringify(workflow)
  });
  const text = await response.text();
  if (!response.ok) throw new Error('n8n create failed ' + response.status + ': ' + text.slice(0, 1000));
  const data = JSON.parse(text);
  console.log(JSON.stringify({ id: data.id, name: data.name, active: data.active }, null, 2));
  fs.writeFileSync('scripts/casaboni-sdr-agent-created.json', JSON.stringify({ id: data.id, name: data.name, active: data.active, createdAt: new Date().toISOString() }, null, 2));
})().catch((error) => { console.error(error.message); process.exit(1); });
