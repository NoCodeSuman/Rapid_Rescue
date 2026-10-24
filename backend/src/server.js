import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();
const PORT = Number(process.env.PORT || 5000);
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map((origin) => origin.trim()).filter(Boolean);

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin(origin, callback) {
  // Allow tools such as curl/Postman (no Origin header) and configured frontend origins.
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Origin is not allowed by CORS.'));
} }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'RapidRescue API', timestamp: new Date().toISOString() });
});

app.get('/api/info', (_req, res) => {
  res.status(200).json({
    name: 'RapidRescue',
    apiVersion: '1.0.0',
    integrations: { firebaseAuth: 'configured in frontend environment', firestoreRules: 'managed in backend/firebase' },
    note: 'Booking, fleet and dispatch workflows still use the existing browser-local demo store. They have not been migrated to server persistence.'
  });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.use((error, _req, res, _next) => {
  if (error?.message === 'Origin is not allowed by CORS.') return res.status(403).json({ error: error.message });
  console.error('API error:', error?.message || error);
  return res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => console.log(`RapidRescue API listening on http://localhost:${PORT}`));
