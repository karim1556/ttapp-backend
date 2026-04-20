'use strict';

const { GoogleAuth } = require('google-auth-library');

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

let authContextPromise = null;

function loadServiceAccountCredentialsFromEnv() {
  const rawJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    try {
      return JSON.parse(rawJson);
    } catch {
      return null;
    }
  }

  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FCM_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) {
    return null;
  }

  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKeyRaw.replace(/\\n/g, '\n'),
  };
}

function normalizeDataPayload(data) {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const normalized = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;

    if (typeof value === 'string') {
      normalized[String(key)] = value;
      continue;
    }

    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      normalized[String(key)] = String(value);
      continue;
    }

    try {
      normalized[String(key)] = JSON.stringify(value);
    } catch {
      normalized[String(key)] = String(value);
    }
  }

  return normalized;
}

async function getAuthContext() {
  if (authContextPromise) return authContextPromise;

  authContextPromise = (async () => {
    const serviceAccount = loadServiceAccountCredentialsFromEnv();

    const auth = serviceAccount
      ? new GoogleAuth({
        credentials: serviceAccount,
        scopes: [FCM_SCOPE],
      })
      : new GoogleAuth({ scopes: [FCM_SCOPE] });

    const client = await auth.getClient();

    const projectId =
      process.env.FCM_PROJECT_ID
      || serviceAccount?.project_id
      || process.env.GCP_PROJECT
      || process.env.GOOGLE_CLOUD_PROJECT
      || await auth.getProjectId().catch(() => null);

    if (!projectId) {
      return null;
    }

    return { client, projectId };
  })();

  return authContextPromise;
}

async function getAccessToken(client) {
  const tokenResult = await client.getAccessToken();

  if (typeof tokenResult === 'string') return tokenResult;
  if (tokenResult && typeof tokenResult === 'object' && tokenResult.token) {
    return tokenResult.token;
  }

  return null;
}

async function sendPushToToken({ token, title, body, data = {} }) {
  if (!token) {
    return { sent: false, reason: 'missing-token' };
  }

  if (typeof fetch !== 'function') {
    return { sent: false, reason: 'fetch-not-available' };
  }

  let authContext;
  try {
    authContext = await getAuthContext();
  } catch (err) {
    return { sent: false, reason: `auth-init-failed: ${err.message}` };
  }

  if (!authContext) {
    return { sent: false, reason: 'missing-fcm-http-v1-config' };
  }

  let accessToken;
  try {
    accessToken = await getAccessToken(authContext.client);
  } catch (err) {
    return { sent: false, reason: `access-token-failed: ${err.message}` };
  }

  if (!accessToken) {
    return { sent: false, reason: 'missing-access-token' };
  }

  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${authContext.projectId}/messages:send`;

  const payload = {
    message: {
      token,
      notification: {
        title,
        body,
      },
      data: normalizeDataPayload(data),
      android: {
        priority: 'HIGH',
        notification: {
          sound: 'default',
        },
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    },
  };

  try {
    const response = await fetch(fcmUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    let parsed;

    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      return {
        sent: false,
        reason: `fcm-http-${response.status}`,
        detail: parsed || raw,
      };
    }

    return { sent: true, detail: parsed || raw };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendPushToToken };
