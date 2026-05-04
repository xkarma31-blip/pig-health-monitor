/**
 * Firebase REST Client — Authenticated via Email/Password
 * 
 * Uses the real admin@farm.local Firebase Auth token to write data,
 * ensuring the simulation respects the same security rules as the app.
 */

const DATABASE_URL = 'https://studio-1248778633-99f62-default-rtdb.firebaseio.com';
const API_KEY = 'AIzaSyC7rpeo9XoXzg4WBoTP5-nWeTQUBroUsxc';
const ADMIN_EMAIL = 'admin@farm.local';
const ADMIN_PASSWORD = '357631';

let cachedToken = null;
let tokenExpiry = 0;

async function getAuthToken() {
  // Return cached token if still valid (with 5min buffer)
  if (cachedToken && Date.now() < tokenExpiry - 300000) {
    return cachedToken;
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        returnSecureToken: true,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Auth failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  cachedToken = data.idToken;
  tokenExpiry = Date.now() + parseInt(data.expiresIn) * 1000;
  console.log(`🔑 Firebase Auth token refreshed (UID: ${data.localId})`);
  return cachedToken;
}

export const db = {
  ref: (dbPath) => ({
    set: async (data) => {
      const token = await getAuthToken();
      const url = `${DATABASE_URL}/${dbPath}.json?auth=${token}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Firebase REST Error: ${response.status} ${err}`);
      }
      return response.json();
    },
    push: () => ({
      set: async (data) => {
        const token = await getAuthToken();
        const url = `${DATABASE_URL}/${dbPath}.json?auth=${token}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Firebase REST Error: ${response.status} ${err}`);
        }
        return response.json();
      }
    })
  })
};
