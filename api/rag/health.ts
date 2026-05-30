export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  res.status(200).json({
    status: "ok",
    n8nWebhookConfigured: Boolean(process.env.N8N_RAG_WEBHOOK_URL),
    driveFolderConfigured: Boolean(process.env.N8N_DRIVE_FOLDER_ID),
    firebaseProjectId: process.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0033143716",
    firestoreDatabaseId:
      process.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-f582f4de-81c3-4a0f-84f5-9a75b5fd666e",
  });
}

