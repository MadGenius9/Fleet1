// Vite exposes these browser client settings; never put private credentials here.
const env = import.meta.env || {};
export const firebaseConfigured = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'configuration-required',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'configuration-required',
  appId: env.VITE_FIREBASE_APP_ID,
  firestoreDatabaseId: env.VITE_FIREBASE_DATABASE_ID || '(default)',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};
