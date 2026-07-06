const { app, safeStorage } = require('electron');
const fs = require('fs');
app.whenReady().then(async () => {
  const keysPath = '/Users/adityaguha/Library/Application Support/inferenceos/keys.json';
  const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
  const encrypted = Buffer.from(keys.gemini, 'hex');
  const apiKey = safeStorage.decryptString(encrypted);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const data = await res.json();
  console.log("AVAILABLE MODELS:");
  console.log(JSON.stringify(data.models.map(m => m.name), null, 2));
  app.quit();
});
