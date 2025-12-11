import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyB8a0qzn4XITYB3L8Q2a0ZkLDDD4lD4DYA",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "beihangquizz.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "beihangquizz",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "beihangquizz.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "938527069834",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:938527069834:web:744686e8762ec713653f73",
};

// Vérifier que les variables d'environnement sont définies
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('⚠️ Variables Firebase manquantes ! Vérifiez vos variables d\'environnement.');
  console.log('Config actuelle:', {
    hasApiKey: !!firebaseConfig.apiKey,
    hasProjectId: !!firebaseConfig.projectId,
    hasAuthDomain: !!firebaseConfig.authDomain,
  });
}

// Initialiser Firebase uniquement s'il n'est pas déjà initialisé
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialiser Firestore
export const db = getFirestore(app);

if (typeof window !== 'undefined') {
  console.log('✅ Firebase initialisé avec le projet:', firebaseConfig.projectId);
}

