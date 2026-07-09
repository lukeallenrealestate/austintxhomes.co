// Shared GSC API client, use in every audit script.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { google } = require('googleapis');

const CFG_DIR = path.join(os.homedir(), '.config', 'gsc');
const creds = JSON.parse(fs.readFileSync(path.join(CFG_DIR, 'client.json'), 'utf8')).installed;
const token = JSON.parse(fs.readFileSync(path.join(CFG_DIR, 'token.json'), 'utf8'));

const oauth2 = new google.auth.OAuth2(creds.client_id, creds.client_secret);
oauth2.setCredentials(token);

const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2 });

module.exports = { searchconsole, oauth2 };
