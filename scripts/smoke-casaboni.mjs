import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase/app";
import { addDoc, collection, getDocs, getFirestore, limit, query, serverTimestamp } from "firebase/firestore";

dotenv.config({ path: ".env.local" });
dotenv.config();

const cfg = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || cfg.apiKey,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || cfg.authDomain,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || cfg.projectId,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || cfg.storageBucket,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || cfg.messagingSenderId,
  appId: process.env.VITE_FIREBASE_APP_ID || cfg.appId,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || cfg.measurementId,
};

const firestoreDatabaseId = process.env.VITE_FIREBASE_DATABASE_ID || cfg.firestoreDatabaseId;
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firestoreDatabaseId);

async function testGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { ok: false, detail: "GEMINI_API_KEY ausente" };
  }
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Responda apenas OK",
    });
    const text = String(res.text || "").trim();
    return { ok: text.toUpperCase().includes("OK"), detail: text || "sem texto" };
  } catch (error) {
    return { ok: false, detail: (error && error.message) || String(error) };
  }
}

async function canRead(path) {
  try {
    const snap = await getDocs(query(collection(db, path), limit(1)));
    return { ok: true, detail: `${snap.size} doc(s)` };
  } catch (error) {
    return { ok: false, detail: error?.code || error?.message || String(error) };
  }
}

async function canWriteLead() {
  try {
    const ref = await addDoc(collection(db, "leads"), {
      name: "Smoke Test",
      phone: "0000-0000",
      date: new Date().toISOString().slice(0, 10),
      status: "Novo",
      createdAt: serverTimestamp(),
      source: "scripts/smoke-casaboni.mjs",
    });
    return { ok: true, detail: ref.id };
  } catch (error) {
    return { ok: false, detail: error?.code || error?.message || String(error) };
  }
}

async function canWriteMeeting() {
  try {
    const ref = await addDoc(collection(db, "meetings"), {
      customerName: "Smoke Meeting",
      customerEmail: "smoke@example.com",
      phone: "0000-0000",
      date: new Date().toISOString().slice(0, 10),
      time: "10:00",
      topic: "Smoke Test",
      status: "Agendada",
      createdAt: serverTimestamp(),
      source: "scripts/smoke-casaboni.mjs",
    });
    return { ok: true, detail: ref.id };
  } catch (error) {
    return { ok: false, detail: error?.code || error?.message || String(error) };
  }
}

async function canWriteProduct() {
  try {
    const ref = await addDoc(collection(db, "products"), {
      name: "Smoke Product",
      collection: "Smoke",
      price: "R$ 0,00",
      status: "Ativo",
      source: "scripts/smoke-casaboni.mjs",
    });
    return { ok: true, detail: ref.id };
  } catch (error) {
    return { ok: false, detail: error?.code || error?.message || String(error) };
  }
}

function print(label, result) {
  const status = result.ok ? "OK" : "FAIL";
  console.log(`[${status}] ${label}: ${result.detail}`);
}

async function main() {
  console.log("Casaboni smoke test");
  console.log(`- projectId: ${firebaseConfig.projectId}`);
  console.log(`- databaseId: ${firestoreDatabaseId}`);

  const gemini = await testGemini();
  const readProducts = await canRead("products");
  const readLeads = await canRead("leads");
  const readMeetings = await canRead("meetings");
  const writeLead = await canWriteLead();
  const writeMeeting = await canWriteMeeting();
  const writeProduct = await canWriteProduct();

  print("Gemini request", gemini);
  print("Read products", readProducts);
  print("Read leads", readLeads);
  print("Read meetings", readMeetings);
  print("Write lead", writeLead);
  print("Write meeting", writeMeeting);
  print("Write product", writeProduct);
}

main();
