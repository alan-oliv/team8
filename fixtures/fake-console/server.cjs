// A stand-in console for the script tests, copied to <root>/dist/server/index.js.
// It answers /health from <root>/fake.json and appends every start's arguments
// and every POST path to <root>/starts.log and <root>/posts.log.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
fs.appendFileSync(path.join(root, 'starts.log'), `${argv.join(' ')}\n`);
const port = Number(argv[argv.indexOf('--port') + 1]);
const config = JSON.parse(fs.readFileSync(path.join(root, 'fake.json'), 'utf8'));

http
  .createServer((req, res) => {
    if (req.method === 'POST') {
      fs.appendFileSync(path.join(root, 'posts.log'), `${req.url}\n`);
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      if (req.url === '/api/shutdown') setTimeout(() => process.exit(0), 20);
      return;
    }
    const status = config.status ?? 200;
    const body = status === 200 ? { ok: true, team: '', agents: 0, tabs: 0, ...config.health } : {};
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  })
  .listen(port, '127.0.0.1');
