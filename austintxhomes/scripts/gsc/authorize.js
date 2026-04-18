// One-time OAuth authorization for Google Search Console API.
// Opens your browser, you approve, refresh token is saved to ~/.config/gsc/token.json
const http = require('http');
const { URL } = require('url');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { google } = require('googleapis');

const CFG_DIR = path.join(os.homedir(), '.config', 'gsc');
const CLIENT_PATH = path.join(CFG_DIR, 'client.json');
const TOKEN_PATH = path.join(CFG_DIR, 'token.json');

const creds = JSON.parse(fs.readFileSync(CLIENT_PATH, 'utf8')).installed;
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}/callback`;

const oauth2 = new google.auth.OAuth2(creds.client_id, creds.client_secret, REDIRECT);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [
    'https://www.googleapis.com/auth/webmasters.readonly',
    'https://www.googleapis.com/auth/indexing'
  ]
});

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/callback')) { res.end('ok'); return; }
  const code = new URL(req.url, REDIRECT).searchParams.get('code');
  try {
    const { tokens } = await oauth2.getToken(code);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    fs.chmodSync(TOKEN_PATH, 0o600);
    res.end('<h2>Done. You can close this tab.</h2>');
    console.log('[auth] refresh token saved to', TOKEN_PATH);
    server.close();
    process.exit(0);
  } catch (err) {
    res.end('Error: ' + err.message);
    console.error(err);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log('[auth] opening browser…');
  console.log('       if it does not open, paste this URL manually:');
  console.log('      ', authUrl);
  exec(`open "${authUrl}"`);
});
