import 'dotenv/config';
import express from 'express';
import cors from 'cors';
const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '100kb' }));
app.get('/api/health', (_req, res) =>
	res.json({ ok: true, service: 'svit-api' }),
);
app.listen(Number(process.env.PORT || 3001), () =>
	console.log('API listening'),
);
/* Business writes use Supabase Auth + PostgreSQL RLS from the frontend.
   This server is only a health/API extension scaffold. Never put a service key in Vite env. */
