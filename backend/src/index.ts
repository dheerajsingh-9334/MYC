import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import prisma from './prisma/client';

import authRoutes from './routes/auth.routes';
import clientsRoutes from './routes/clients.routes';
import tasksRoutes from './routes/tasks.routes';
import stepsRoutes from './routes/steps.routes';
import usersRoutes from './routes/users.routes';
import notificationsRoutes from './routes/notifications.routes';
import standupRoutes from './routes/standup.routes';
import dashboardRoutes from './routes/dashboard.routes';
import onboardingRoutes from './routes/onboarding.routes';
import draftsRoutes from './routes/drafts.routes';
import preferencesRoutes from './routes/preferences.routes';
import adminRoutes from './routes/admin.routes';
import vaultRoutes from './routes/vault.routes';
import teamsRoutes from './routes/teams.routes';
import reportsRoutes from './routes/reports.routes';
import { startCronJobs } from './services/cron.service';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/steps', stepsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/standup', standupRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/drafts', draftsRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/reports', reportsRoutes);

// Health check — also reports DB connection status
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err: any) {
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: err?.message || 'unknown',
      timestamp: new Date().toISOString(),
    });
  }
});

// Verify DB connection on startup and log the result
async function verifyDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connected successfully');
    return true;
  } catch (err: any) {
    console.error('❌ Database connection failed:', err?.message || err);
    return false;
  }
}

// Start server
app.listen(PORT, async () => {
  console.log(`\n🚀 MyC Ops API running at http://localhost:${PORT}`);
  await verifyDatabaseConnection();
  startCronJobs();
});

export default app;
