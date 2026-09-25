// Vercel Function: latest form submissions for the admin page.
import { handleSubmissionsRequest } from '../../lib/forms.mjs';
import { redisFromEnv } from '../../lib/store.mjs';

export const GET = (req) => handleSubmissionsRequest(req, { store: redisFromEnv(), adminPassword: process.env.ADMIN_PASSWORD });
