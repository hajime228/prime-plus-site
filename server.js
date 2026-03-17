const express = require("express");
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const XLSX = require("xlsx");

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!ADMIN_PASSWORD || !SESSION_SECRET) {
  console.error("Не заданы ADMIN_PASSWORD и/или SESSION_SECRET в переменных окружения.");
  process.exit(1);
}

const SLOTS_FILE = path.join(__dirname, "slots.json");
const EXCEL_FILE = path.join(__dirname, "doma.xlsx");
const PUBLIC_DIR = path.join(__dirname, "public");

app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false
    }
  })
);

app.use(express.static(PUBLIC_DIR));

function readSlots() {
  if (!fs.existsSync(SLOTS_FILE)) {
    const initial = Array(16).fill(0);
    fs.writeFileSync(SLOTS_FILE, JSON.stringify(initial), "utf8");
    return initial;
  }
  try {
    const raw = fs.readFileSync(SLOTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 16) return parsed;
  } catch (_) {}
  const fallback = Array(16).fill(0);
  fs.writeFileSync(SLOTS_FILE, JSON.stringify(fallback), "utf8");
  return fallback;
}

function writeSlots(slots) {
  fs.writeFileSync(SLOTS_FILE, JSON.stringify(slots), "utf8");
}

function readHouses() {
  if (!fs.existsSync(EXCEL_FILE)) return [];
  const workbook = XLSX.readFile(EXCEL_FILE);
  const firstSheet = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

app.get("/api/slots", (req, res) => {
  res.json(readSlots());
});

app.get("/api/houses", (req, res) => {
  res.json(readHouses());
});

app.get("/api/admin/status", (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin });
});

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false, message: "Неверный пароль" });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.post("/api/admin/save-slots", (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ ok: false, message: "Нет доступа" });
  }

  const { slots } = req.body || {};
  if (!Array.isArray(slots) || slots.length !== 16) {
    return res.status(400).json({ ok: false, message: "Некорректные данные" });
  }

  const normalized = slots.map((v) => (v ? 1 : 0));
  writeSlots(normalized);
  res.json({ ok: true });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});