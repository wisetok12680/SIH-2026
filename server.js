const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let reqUrl = req.url.split('?')[0];

  let filePath = '';
  if (reqUrl === '/' || reqUrl === '/job-application' || reqUrl === '/test-page' || reqUrl === '/test-page.html') {
    filePath = path.join(__dirname, 'test-page.html');
  } else if (reqUrl === '/gpus' || reqUrl === '/gpu-store' || reqUrl === '/gpu-store.html') {
    filePath = path.join(__dirname, 'gpu-store.html');
  } else {
    filePath = path.join(__dirname, reqUrl);
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'text/html; charset=utf-8';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<div style="font-family: sans-serif; background: #0a0a0a; color: #f5f5f5; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;"><h1>404 - Page Not Found</h1><p>Agent Local Web Server</p><a href="/" style="color: #a3a3a3; margin-top: 10px;">Return Home</a></div>');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[Agent Web Server] Server listening on http://localhost:${PORT}`);
  console.log(`  -> Job Application Page: http://localhost:${PORT}/`);
  console.log(`  -> GPU Specifications:   http://localhost:${PORT}/gpus`);
});
