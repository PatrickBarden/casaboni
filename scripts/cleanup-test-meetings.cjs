const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local', override: true });
dotenv.config();

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const firebaseToolsConfigPath = `${process.env.USERPROFILE}/.config/configstore/firebase-tools.json`;
const cliConfig = JSON.parse(fs.readFileSync(firebaseToolsConfigPath, 'utf8'));
const accessToken = cliConfig.tokens?.access_token;
const dryRun = process.argv.includes('--dry-run');

if (!accessToken) throw new Error('Firebase CLI access token not found. Run npx firebase-tools login first.');

function readValue(value) {
  if (!value) return '';
  return value.stringValue ?? value.integerValue ?? value.doubleValue ?? value.booleanValue ?? value.timestampValue ?? '';
}

function meetingFields(document) {
  const fields = document.fields || {};
  return {
    id: document.name.split('/').pop(),
    path: document.name,
    customerName: readValue(fields.customerName),
    customerEmail: readValue(fields.customerEmail),
    phone: readValue(fields.phone),
    topic: readValue(fields.topic),
    source: readValue(fields.source),
    date: readValue(fields.date),
  };
}

function isTestMeeting(meeting) {
  const haystack = [meeting.customerName, meeting.customerEmail, meeting.phone, meeting.topic, meeting.source]
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return (
    haystack.includes('smoke') ||
    haystack.includes('teste') ||
    haystack.includes('example.com') ||
    haystack.includes('seed-manual') ||
    haystack.includes('scripts/smoke') ||
    haystack.includes('0000-0000') ||
    haystack.includes('email.com')
  );
}

async function listMeetings(pageToken = '') {
  const params = new URLSearchParams({ pageSize: '100' });
  if (pageToken) params.set('pageToken', pageToken);
  const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${config.firestoreDatabaseId}/documents/meetings?${params}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`List meetings failed ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response.json();
}

async function deleteMeeting(path) {
  const url = `https://firestore.googleapis.com/v1/${path}`;
  const response = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Delete failed ${response.status}: ${(await response.text()).slice(0, 500)}`);
}

async function main() {
  const meetings = [];
  let pageToken = '';
  do {
    const page = await listMeetings(pageToken);
    meetings.push(...(page.documents || []).map(meetingFields));
    pageToken = page.nextPageToken || '';
  } while (pageToken);

  const testMeetings = meetings.filter(isTestMeeting);
  console.log(`Meetings found: ${meetings.length}`);
  console.log(`Test meetings to remove: ${testMeetings.length}`);
  for (const meeting of testMeetings) {
    console.log(`${dryRun ? '[dry-run]' : '[delete]'} ${meeting.id} | ${meeting.customerName} | ${meeting.customerEmail} | ${meeting.topic} | ${meeting.source}`);
    if (!dryRun) await deleteMeeting(meeting.path);
  }
  console.log(dryRun ? 'Dry run complete.' : 'Cleanup complete.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
