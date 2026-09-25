// Vercel Function: public site settings (GET) and admin updates (PUT).
import { handleSettingsRequest } from '../lib/settings.mjs';
import { redisFromEnv } from '../lib/store.mjs';

const handle = (req) => handleSettingsRequest(req, { store: redisFromEnv(), adminPassword: process.env.ADMIN_PASSWORD });

export { handle as GET, handle as HEAD, handle as PUT };
