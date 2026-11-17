import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
] as const;

const app = initializeApp(firebaseConfig);
const firestoreDatabaseId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
export const db = firestoreDatabaseId
  ? getFirestore(app, firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

WORKSPACE_SCOPES.forEach((scope) => {
  googleProvider.addScope(scope);
});

// In-memory cache only for Workspace OAuth access token (never localStorage/sessionStorage)
let cachedDriveAccessToken: string | null = null;
const tokenListeners = new Set<(token: string | null) => void>();

function setDriveAccessToken(token: string | null) {
  cachedDriveAccessToken = token;
  tokenListeners.forEach((listener) => listener(token));
}

export function subscribeDriveAccessToken(listener: (token: string | null) => void): () => void {
  tokenListeners.add(listener);
  listener(cachedDriveAccessToken);
  return () => {
    tokenListeners.delete(listener);
  };
}

export function getDriveAccessToken(): string | null {
  return cachedDriveAccessToken;
}

export function clearDriveAccessToken(): void {
  setDriveAccessToken(null);
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    setDriveAccessToken(null);
  }
});

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
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: client is offline.');
    }
  }
}

testConnection();

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) {
    setDriveAccessToken(credential.accessToken);
  }
  return result;
}

export async function connectGoogleDrive(): Promise<string> {
  const current = auth.currentUser;
  const result = current
    ? await reauthenticateWithPopup(current, googleProvider)
    : await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Google Drive access token was not granted. Please try again.');
  }
  setDriveAccessToken(credential.accessToken);
  return credential.accessToken;
}

export async function signOutUser() {
  setDriveAccessToken(null);
  return signOut(auth);
}
