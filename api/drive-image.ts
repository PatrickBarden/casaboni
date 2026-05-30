function isValidDriveFileId(id: string) {
  return /^[a-zA-Z0-9_-]{10,}$/.test(id);
}

async function fetchDriveImage(id: string, mode: "auto" | "thumb" = "auto") {
  const urls =
    mode === "thumb"
      ? [`https://drive.google.com/thumbnail?id=${id}&sz=w1200`]
      : [
          `https://drive.usercontent.google.com/download?id=${id}&export=view`,
          `https://drive.google.com/thumbnail?id=${id}&sz=w1200`,
        ];

  for (const url of urls) {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 Casaboni/1.0" },
    });
    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.startsWith("image/")) {
      const bytes = Buffer.from(await response.arrayBuffer());
      return { bytes, contentType };
    }
  }

  return null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const idParam = req.query?.id;
    const id = Array.isArray(idParam) ? String(idParam[0] || "").trim() : String(idParam || "").trim();
    const mode = req.query?.mode === "thumb" ? "thumb" : "auto";

    if (!isValidDriveFileId(id)) {
      res.status(400).json({ ok: false, error: "Invalid file id" });
      return;
    }

    const image = await fetchDriveImage(id, mode);
    if (!image) {
      res.status(404).json({ ok: false, error: "Image not found" });
      return;
    }

    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(200).send(image.bytes);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

