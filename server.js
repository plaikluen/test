const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, "data");
const uploadsDir = path.join(__dirname, "uploads");
const publicDir = path.join(__dirname, "public");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const dbPath = path.join(dataDir, "event-signatures.db");
const db = new sqlite3.Database(dbPath);

const DEFAULT_TRAITS = [
  "คนที่ตัวเองคิดว่าน่ารักจังเลยนะ",
  "คนที่มีเกล็ด",
  "คนที่มีเขา",
  "คนที่มีหาง",
  "คนที่ตัวเองคิดว่าหน้าตาดี",
  "คนที่ดูแข็งแกร่ง",
  "คนที่มีเขี้ยว",
  "คนที่ถือปากกาอยู่ตอนนี้",
  "คนที่อยู่ชั้นมังไก",
  "คนที่เจาะหู",
  "คนที่อยู่หอพักฤดูร้อน"
];

const backupsDir = path.join(__dirname, "backups");
const POST_COOLDOWN_MS = 30 * 1000;
const DAILY_BACKUP_MS = 24 * 60 * 60 * 1000;
const postCooldownByIp = new Map();

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.ip || "unknown";
}

function runDatabaseBackup() {
  ensureDirectory(backupsDir);

  if (!fs.existsSync(dbPath)) {
    return;
  }

  const now = new Date();
  const dateTag = now.toISOString().replace(/[.:]/g, "-");
  const backupFileName = `event-signatures-${dateTag}.db`;
  const backupPath = path.join(backupsDir, backupFileName);
  fs.copyFile(dbPath, backupPath, () => {});
}

function scheduleDailyBackup() {
  runDatabaseBackup();
  setInterval(() => {
    runDatabaseBackup();
  }, DAILY_BACKUP_MS);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ext && ext.length <= 8 ? ext : ".jpg";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(publicDir));

function initializeDatabase() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        image_url TEXT,
        profile_link TEXT,
        rp_post_link TEXT,
        delete_code_hash TEXT,
        traits TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_participants_created_at
      ON participants(created_at DESC)
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS custom_traits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        created_at TEXT NOT NULL
      )
    `);

    db.all("PRAGMA table_info(participants)", [], (pragmaError, columns) => {
      if (pragmaError) {
        return;
      }

      const hasDeleteCodeHash = columns.some((column) => column.name === "delete_code_hash");
      if (!hasDeleteCodeHash) {
        db.run("ALTER TABLE participants ADD COLUMN delete_code_hash TEXT DEFAULT ''");
      }
    });
  });
}

function safeJsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed;
  } catch (error) {
    return fallback;
  }
}

function normalizeTraits(rawTraits) {
  if (!rawTraits) {
    return [];
  }

  let traits = [];
  if (Array.isArray(rawTraits)) {
    traits = rawTraits;
  } else if (typeof rawTraits === "string") {
    const firstParse = safeJsonParse(rawTraits, null);
    const parsed = typeof firstParse === "string"
      ? safeJsonParse(firstParse, null)
      : firstParse;

    if (Array.isArray(parsed)) {
      traits = parsed;
    } else {
      traits = rawTraits.split(",");
    }
  }

  const cleaned = traits
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return Array.from(new Set(cleaned));
}

function normalizeTraitName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function hashDeleteCode(deleteCode) {
  return crypto.createHash("sha256").update(deleteCode).digest("hex");
}

function removeUploadedFileIfExists(imageUrl) {
  if (!imageUrl || !String(imageUrl).startsWith("/uploads/")) {
    return;
  }

  const filePath = path.join(__dirname, String(imageUrl).replace(/^\//, ""));
  fs.unlink(filePath, () => {});
}

app.get("/api/traits", (req, res) => {
  db.all("SELECT traits FROM participants", [], (participantsError, participantRows) => {
    if (participantsError) {
      return res.status(500).json({ error: "โหลดรายการคุณลักษณะไม่สำเร็จ" });
    }

    db.all("SELECT name FROM custom_traits", [], (customTraitsError, customTraitRows) => {
      if (customTraitsError) {
        return res.status(500).json({ error: "โหลดรายการคุณลักษณะไม่สำเร็จ" });
      }

      const traitSet = new Set(DEFAULT_TRAITS);

      participantRows.forEach((row) => {
        const traits = normalizeTraits(row.traits);
        traits.forEach((trait) => traitSet.add(trait));
      });

      customTraitRows.forEach((row) => {
        traitSet.add(normalizeTraitName(row.name));
      });

      const traits = Array.from(traitSet)
        .map((trait) => normalizeTraitName(trait))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "th"));

      return res.json({ traits });
    });
  });
});

app.post("/api/traits", (req, res) => {
  const name = normalizeTraitName(req.body.name);

  if (!name) {
    return res.status(400).json({ error: "กรุณาใส่ชื่อคุณลักษณะ" });
  }

  if (name.length > 40) {
    return res.status(400).json({ error: "คุณลักษณะยาวเกินไป (ไม่เกิน 40 ตัวอักษร)" });
  }

  const nowIso = new Date().toISOString();
  db.run(
    "INSERT OR IGNORE INTO custom_traits (name, created_at) VALUES (?, ?)",
    [name, nowIso],
    function onInsert(error) {
      if (error) {
        return res.status(500).json({ error: "เพิ่มคุณลักษณะไม่สำเร็จ" });
      }

      return res.status(201).json({
        added: this.changes > 0,
        name,
        message: this.changes > 0 ? "เพิ่มตัวเลือกเรียบร้อย" : "มีตัวเลือกนี้อยู่แล้ว"
      });
    }
  );
});

app.get("/api/participants", (req, res) => {
  const searchText = String(req.query.search || "").trim().toLowerCase();
  const traitFilter = String(req.query.trait || "").trim().toLowerCase();

  db.all(
    "SELECT * FROM participants ORDER BY datetime(created_at) DESC",
    [],
    (error, rows) => {
      if (error) {
        return res.status(500).json({ error: "โหลดข้อมูลไม่สำเร็จ" });
      }

      const mapped = rows.map((row) => {
        const traits = normalizeTraits(row.traits);
        return {
          id: row.id,
          name: row.name,
          imageUrl: row.image_url || "",
          profileLink: row.profile_link || "",
          rpPostLink: row.rp_post_link || "",
          traits,
          createdAt: row.created_at
        };
      });

      const filtered = mapped.filter((person) => {
        const inSearch =
          !searchText ||
          person.name.toLowerCase().includes(searchText) ||
          person.profileLink.toLowerCase().includes(searchText) ||
          person.rpPostLink.toLowerCase().includes(searchText) ||
          person.traits.some((trait) => trait.toLowerCase().includes(searchText));

        const inTrait =
          !traitFilter ||
          person.traits.some((trait) => trait.toLowerCase() === traitFilter);

        return inSearch && inTrait;
      });

      return res.json({ participants: filtered });
    }
  );
});

app.post("/api/participants", upload.single("image"), (req, res) => {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const lastPostAt = postCooldownByIp.get(clientIp) || 0;
  const diff = now - lastPostAt;

  if (diff < POST_COOLDOWN_MS) {
    const waitSeconds = Math.ceil((POST_COOLDOWN_MS - diff) / 1000);
    return res.status(429).json({ error: `โพสต์ถี่เกินไป กรุณารอ ${waitSeconds} วินาที` });
  }

  const name = String(req.body.name || "").trim();
  const profileLink = String(req.body.profileLink || "").trim();
  const rpPostLink = String(req.body.rpPostLink || "").trim();
  const deleteCode = String(req.body.deleteCode || "").trim();
  const imageUrlFromText = String(req.body.imageUrl || "").trim();
  const traits = normalizeTraits(req.body.traits);

  if (!name) {
    return res.status(400).json({ error: "กรุณากรอกชื่อ" });
  }

  if (deleteCode.length < 4 || deleteCode.length > 40) {
    return res.status(400).json({ error: "กรุณาตั้งรหัสลบโพสต์ 4-40 ตัวอักษร" });
  }

  const imageUrl = req.file
    ? `/uploads/${req.file.filename}`
    : imageUrlFromText;
  const deleteCodeHash = hashDeleteCode(deleteCode);

  const nowIso = new Date().toISOString();

  db.run(
    `
      INSERT INTO participants (name, image_url, profile_link, rp_post_link, delete_code_hash, traits, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [name, imageUrl, profileLink, rpPostLink, deleteCodeHash, JSON.stringify(traits), nowIso],
    function onInsert(error) {
      if (error) {
        return res.status(500).json({ error: "บันทึกข้อมูลไม่สำเร็จ" });
      }

      postCooldownByIp.set(clientIp, now);

      return res.status(201).json({
        id: this.lastID,
        message: "บันทึกข้อมูลเรียบร้อย"
      });
    }
  );
});

app.delete("/api/participants/:id", (req, res) => {
  const id = Number(req.params.id);
  const deleteCode = String(req.body.deleteCode || "").trim();

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "รหัสโพสต์ไม่ถูกต้อง" });
  }

  if (!deleteCode) {
    return res.status(400).json({ error: "กรุณาใส่รหัสลบโพสต์" });
  }

  db.get(
    "SELECT image_url, delete_code_hash FROM participants WHERE id = ?",
    [id],
    (findError, row) => {
      if (findError) {
        return res.status(500).json({ error: "ตรวจสอบโพสต์ไม่สำเร็จ" });
      }

      if (!row) {
        return res.status(404).json({ error: "ไม่พบโพสต์นี้" });
      }

      if (!row.delete_code_hash || row.delete_code_hash !== hashDeleteCode(deleteCode)) {
        return res.status(403).json({ error: "รหัสลบโพสต์ไม่ถูกต้อง" });
      }

      db.run("DELETE FROM participants WHERE id = ?", [id], (deleteError) => {
        if (deleteError) {
          return res.status(500).json({ error: "ลบโพสต์ไม่สำเร็จ" });
        }

        removeUploadedFileIfExists(row.image_url);

        return res.json({ message: "ลบโพสต์เรียบร้อย" });
      });
    }
  );
});

app.put("/api/participants/:id", upload.single("image"), (req, res) => {
  const id = Number(req.params.id);
  const deleteCode = String(req.body.deleteCode || "").trim();

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "รหัสโพสต์ไม่ถูกต้อง" });
  }

  if (!deleteCode) {
    return res.status(400).json({ error: "กรุณาใส่รหัสลบโพสต์เพื่อแก้ไข" });
  }

  db.get("SELECT * FROM participants WHERE id = ?", [id], (findError, row) => {
    if (findError) {
      return res.status(500).json({ error: "ตรวจสอบโพสต์ไม่สำเร็จ" });
    }

    if (!row) {
      return res.status(404).json({ error: "ไม่พบโพสต์นี้" });
    }

    if (!row.delete_code_hash || row.delete_code_hash !== hashDeleteCode(deleteCode)) {
      return res.status(403).json({ error: "รหัสลบโพสต์ไม่ถูกต้อง" });
    }

    const hasName = Object.prototype.hasOwnProperty.call(req.body, "name");
    const hasProfileLink = Object.prototype.hasOwnProperty.call(req.body, "profileLink");
    const hasRpPostLink = Object.prototype.hasOwnProperty.call(req.body, "rpPostLink");
    const hasTraits = Object.prototype.hasOwnProperty.call(req.body, "traits");
    const removeImage = String(req.body.removeImage || "false").toLowerCase() === "true";

    const nextName = hasName ? String(req.body.name || "").trim() : row.name;
    const nextProfileLink = hasProfileLink
      ? String(req.body.profileLink || "").trim()
      : (row.profile_link || "");
    const nextRpPostLink = hasRpPostLink
      ? String(req.body.rpPostLink || "").trim()
      : (row.rp_post_link || "");
    const nextTraits = hasTraits ? normalizeTraits(req.body.traits) : normalizeTraits(row.traits);

    if (!nextName) {
      return res.status(400).json({ error: "ชื่อห้ามว่าง" });
    }

    let nextImageUrl = row.image_url || "";

    if (removeImage) {
      nextImageUrl = "";
    }

    if (req.file) {
      nextImageUrl = `/uploads/${req.file.filename}`;
    }

    db.run(
      `
        UPDATE participants
        SET name = ?, image_url = ?, profile_link = ?, rp_post_link = ?, traits = ?
        WHERE id = ?
      `,
      [nextName, nextImageUrl, nextProfileLink, nextRpPostLink, JSON.stringify(nextTraits), id],
      (updateError) => {
        if (updateError) {
          return res.status(500).json({ error: "แก้ไขโพสต์ไม่สำเร็จ" });
        }

        const hadOldImage = !!row.image_url;
        const changedImage = row.image_url !== nextImageUrl;
        if (hadOldImage && changedImage) {
          removeUploadedFileIfExists(row.image_url);
        }

        return res.json({ message: "แก้ไขโพสต์เรียบร้อย" });
      }
    );
  });
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ error: "รูปแบบ JSON ไม่ถูกต้อง" });
  }

  if (error && error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "รูปภาพต้องมีขนาดไม่เกิน 5MB" });
  }

  return res.status(500).json({ error: "เกิดข้อผิดพลาดในระบบ" });
});

initializeDatabase();
scheduleDailyBackup();

app.use((req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
