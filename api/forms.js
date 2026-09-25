// Vercel Function: receives the agent and contact forms.
import { handleFormRequest } from '../lib/forms.mjs';
import { redisFromEnv } from '../lib/store.mjs';

export const POST = (req) => handleFormRequest(req, { store: redisFromEnv(), env: process.env });
