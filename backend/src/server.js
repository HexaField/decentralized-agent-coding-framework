/* Minimal orchestrator backend */
const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan');
const WebSocket = require('ws');

const PORT = process.env.API_PORT || 8080;
const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim());

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
app.use(cors({ origin: (origin, cb) => {
  if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
  cb(new Error('CORS blocked'));
}}));

// Health endpoints
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/ready', (req, res) => res.json({ ready: true }));

// Job creation (mock)
app.post('/v1/jobs', (req, res) => {
  const jobId = `job_${Date.now()}`;
  res.json({ jobId });
});

// Context search (mock)
app.get('/v1/context/search', (req, res) => {
  const q = req.query.q || '';
  res.json({ query: q, results: [] });
});

const server = http.createServer(app);

// WebSocket for streaming job logs
const wss = new WebSocket.Server({ server, path: '/v1/stream' });
wss.on('connection', (ws, req) => {
  ws.send(JSON.stringify({ type: 'status', ts: Date.now(), payload: 'connected' }));
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'heartbeat', ts: Date.now(), payload: 'ping' }));
    }
  }, 10000);
  ws.on('close', () => clearInterval(interval));
});

server.listen(PORT, () => {
  console.log(`orchestrator listening on :${PORT}`);
});
