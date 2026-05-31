const fs = require('fs');
const codeNode = fs.readFileSync('scripts/casaboni-sdr-engine-code.js', 'utf8').replace(/^\uFEFF/, '');
const workflow = {
  name: 'Casaboni - SDR Agent v1',
  nodes: [
    { parameters: { httpMethod: 'POST', path: 'casaboni-sdr-agent', responseMode: 'responseNode', options: {} }, id: 'casaboni-sdr-webhook', name: 'Webhook SDR Chat', type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position: [260, 300], onError: 'continueRegularOutput' },
    { parameters: { jsCode: codeNode }, id: 'casaboni-sdr-engine', name: 'Motor SDR n8n', type: 'n8n-nodes-base.code', typeVersion: 2, position: [560, 300], onError: 'continueRegularOutput' },
    { parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: { responseCode: 200 } }, id: 'casaboni-sdr-response', name: 'Responder Chat', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.5, position: [860, 300] }
  ],
  connections: {
    'Webhook SDR Chat': { main: [[{ node: 'Motor SDR n8n', type: 'main', index: 0 }]] },
    'Motor SDR n8n': { main: [[{ node: 'Responder Chat', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1', saveDataErrorExecution: 'all', saveDataSuccessExecution: 'all', saveManualExecutions: true }
};
fs.writeFileSync('scripts/casaboni-sdr-agent-workflow.json', JSON.stringify(workflow, null, 2), 'utf8');
console.log('created scripts/casaboni-sdr-agent-workflow.json');
