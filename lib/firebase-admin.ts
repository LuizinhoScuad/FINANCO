import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  // No Firebase App Hosting, FIREBASE_CONFIG é definido automaticamente e o
  // ambiente já provê Application Default Credentials (ADC) com as permissões
  // necessárias — não precisamos de service account explícito.
  if (process.env.FIREBASE_CONFIG) {
    const { projectId } = JSON.parse(process.env.FIREBASE_CONFIG);
    return initializeApp({ projectId });
  }

  // Localmente, usa credenciais explícitas do .env
  const projectId = process.env.GCLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      projectId,
    });
  }

  return initializeApp(projectId ? { projectId } : undefined);
}

const adminApp = getAdminApp();

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
