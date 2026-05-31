const fs = require('fs');
const dotenv = require('dotenv');
(async () => {
  dotenv.config({ path: '.env.local', override: true });
  const apiUrl = ((process.env.N8N_API_URL || '').replace(/\/$/, '') + '/api/v1');
  const apiKey = process.env.N8N_API_KEY || '';
  const created = JSON.parse(fs.readFileSync('scripts/casaboni-sdr-agent-created.json', 'utf8'));
  const workflow = JSON.parse(fs.readFileSync('scripts/casaboni-sdr-agent-workflow.json', 'utf8'));
  const response = await fetch(apiUrl + '/workflows/' + created.id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-N8N-API-KEY': apiKey },
    body: JSON.stringify({ name: workflow.name, nodes: workflow.nodes, connections: workflow.connections, settings: workflow.settings })
  });
  const text = await response.text();
  if (!response.ok) throw new Error('n8n update failed ' + response.status + ': ' + text.slice(0, 1000));
  const data = JSON.parse(text);
  console.log(JSON.stringify({ id: data.id, name: data.name, active: data.active, nodeCount: data.nodes?.length }, null, 2));
  console.log('Republish the active webhook after this update by toggling the workflow off/on in n8n or using n8n_update_partial_workflow.');
})().catch((error) => { console.error(error.message); process.exit(1); });
