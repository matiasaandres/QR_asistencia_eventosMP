const AUTH_USERNAME = 'mundopalabra';
const AUTH_PASSWORD = 'mundo31036';

export const AUTH_SESSION_KEY = 'mp_auth_session';
export const AUTH_SESSION_DURATION_MS = 5 * 60 * 60 * 1000;

export function getActiveAuthSession() {
  try {
    const rawSession = localStorage.getItem(AUTH_SESSION_KEY);
    if (!rawSession) return null;

    const session = JSON.parse(rawSession);
    if (
      session?.username !== AUTH_USERNAME ||
      !Number.isFinite(session?.expiresAt) ||
      session.expiresAt <= Date.now()
    ) {
      localStorage.removeItem(AUTH_SESSION_KEY);
      return null;
    }

    return session;
  } catch (error) {
    localStorage.removeItem(AUTH_SESSION_KEY);
    return null;
  }
}

export function authenticate(username, password) {
  if (username.trim() !== AUTH_USERNAME || password !== AUTH_PASSWORD) {
    return null;
  }

  const session = {
    username: AUTH_USERNAME,
    expiresAt: Date.now() + AUTH_SESSION_DURATION_MS
  };

  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_SESSION_KEY);
}
