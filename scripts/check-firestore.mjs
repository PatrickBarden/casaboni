import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { initializeApp } from "firebase/app";
import { addDoc, collection, getDocs, getFirestore, limit, query, serverTimestamp } from "firebase/firestore";

dotenv.config({ path: ".env.local" });
dotenv.config();

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const appletConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || appletConfig.apiKey,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket,
  messagingSenderId:
    process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId,
  appId: process.env.VITE_FIREBASE_APP_ID || appletConfig.appId,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || appletConfig.measurementId,
};

const firestoreDatabaseId =
  process.env.VITE_FIREBASE_DATABASE_ID || appletConfig.firestoreDatabaseId;

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firestoreDatabaseId);

const canWrite = process.argv.includes("--write");

function logConfig() {
  console.log("Firestore target:");
  console.log(`- projectId: ${firebaseConfig.projectId}`);
  console.log(`- databaseId: ${firestoreDatabaseId}`);
}

async function tryRead(collectionName) {
  try {
    const snap = await getDocs(query(collection(db, collectionName), limit(1)));
    console.log(`[OK] read ${collectionName}: ${snap.size} doc(s)`);
  } catch (error) {
    const message = error?.code || error?.message || String(error);
    console.log(`[FAIL] read ${collectionName}: ${message}`);
  }
}

async function tryWriteLead() {
  try {
    const ref = await addDoc(collection(db, "leads"), {
      name: "Healthcheck Local",
      phone: "0000-0000",
      date: new Date().toISOString().slice(0, 10),
      status: "Novo",
      createdAt: serverTimestamp(),
      source: "scripts/check-firestore.mjs",
    });
    console.log(`[OK] write leads: ${ref.id}`);
  } catch (error) {
    const message = error?.code || error?.message || String(error);
    console.log(`[FAIL] write leads: ${message}`);
  }
}

async function main() {
  logConfig();
  await tryRead("products");
  await tryRead("leads");
  await tryRead("meetings");

  if (canWrite) {
    await tryWriteLead();
  } else {
    console.log("Write check skipped. Use --write to test lead creation.");
  }
}

main();
