// Netlify Function: public site settings + admin updates, stored in Netlify Blobs.
import { getStore } from '@netlify/blobs';
import { handleSettingsRequest } from '../../lib/settings.mjs';

export default async (req) => {
  const blobs = getStore({ name: 'site', consistency: 'strong' });
  const store = {
    get: (key) => blobs.get(key, { type: 'json' }),
    set: (key, value) => blobs.setJSON(key, value),
  };
  return handleSettingsRequest(req, { store, adminPassword: process.env.ADMIN_PASSWORD });
};

export const config = {
  path: ['/api/settings', '/api/admin/verify'],
};
