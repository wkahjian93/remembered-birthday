// Fake OpenAI for local testing of the team server (no real key, no cost): node test/mock-openai.js
// Answers chat completions with a fixed wish and image edits with the app icon. Logs what it received.
const http = require('http');
const fs = require('fs');
const path = require('path');

const png = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'icons', 'icon-512.png')).toString('base64');

http.createServer((req, res) => {
  let size = 0; const chunks = [];
  req.on('data', c => { size += c.length; chunks.push(c); });
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('latin1');
    const field = name => (body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`)) || [])[1];
    console.log(req.method, req.url, `auth=${req.headers.authorization}`, `bytes=${size}`,
      req.url.includes('images') ? `model=${field('model')} size=${field('size')} quality=${field('quality')}` : '');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url.endsWith('/chat/completions')) {
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ posterLine: 'Mock line from the team server', message: 'Happy birthday from the mock team server!' }) } }] }));
    } else res.end(JSON.stringify({ data: [{ b64_json: png }] }));
  });
}).listen(8799, () => console.log('mock OpenAI on http://127.0.0.1:8799'));
