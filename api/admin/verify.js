// Vercel Function: checks the admin password.
import { handleSettingsRequest } from '../../lib/settings.mjs';

export const POST = (req) => handleSettingsRequest(req, { store: null, adminPassword: process.env.ADMIN_PASSWORD });
