import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  setPersistence,
  signInWithPopup,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseAppletConfig from '../firebase-applet-config.json';

const env = (import.meta as any).env ?? {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || firebaseAppletConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || firebaseAppletConfig.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || firebaseAppletConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseAppletConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || firebaseAppletConfig.appId,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || firebaseAppletConfig.measurementId,
};

const firestoreDatabaseId =
  env.VITE_FIREBASE_DATABASE_ID || firebaseAppletConfig.firestoreDatabaseId;

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Ensure redirect login can restore session reliably across reloads/local dev.
let authBootstrapPromise: Promise<void> | null = null;
export const waitForAuthBootstrap = () => {
  if (!authBootstrapPromise) {
    authBootstrapPromise = (async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (error) {
        console.warn('Auth persistence setup failed:', error);
      }
      try {
        await getRedirectResult(auth);
      } catch (error) {
        console.warn('Auth redirect result check failed:', error);
      }
    })();
  }
  return authBootstrapPromise;
};

// Error Handling Spec for Firestore Operations
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate Connection to Firestore
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
    // Skip logging for other errors, as this is simply a connection test.
  }
}
testConnection();

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    const code = (error as any)?.code as string | undefined;
    // Avoid redirect fallback in embedded browsers (can lose OAuth state in sessionStorage).
    if (code === "auth/popup-blocked" || code === "auth/cancelled-popup-request") {
      throw error;
    }
    console.error("Error signing in with Google:", error);
    throw error;
  }
};

export function getFirebaseAuthErrorMessage(error: unknown) {
  const code = (error as any)?.code as string | undefined;
  if (code === "auth/unauthorized-domain") {
    const currentHost =
      typeof window !== "undefined" ? window.location.hostname : "seu-dominio";
    return `Domínio não autorizado no Firebase Auth. Adicione ${currentHost} em Authentication > Settings > Authorized domains.`;
  }
  if (code === "auth/operation-not-allowed") {
    return "Login Google desabilitado no Firebase. Ative em Authentication > Sign-in method.";
  }
  if (code === "auth/popup-closed-by-user") {
    return "Popup de login foi fechado antes da conclusão.";
  }
  if (code === "auth/popup-blocked") {
    return "Popup bloqueado pelo navegador. Permita popups/cookies ou abra o painel em Chrome/Edge (fora do navegador interno).";
  }
  if (code === "auth/cancelled-popup-request") {
    return "Solicitação de popup cancelada. Tente novamente em navegador comum (Chrome/Edge).";
  }
  if (code === "auth/web-storage-unsupported") {
    return "Este navegador não suporta o armazenamento exigido pelo Firebase Auth. Abra o painel em Chrome/Edge.";
  }
  return `Falha no login Google${code ? ` (${code})` : ""}.`;
}


