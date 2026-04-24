const express = require("express");
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const XLSX = require("xlsx");

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SESSION_SECRET = process.env.SESSION_SECRET || "prime-plus-secret";
const YANDEX_MAPS_API_KEY = process.env.YANDEX_MAPS_API_KEY || "";
const YANDEX_GEOCODER_API_KEY = process.env.YANDEX_GEOCODER_API_KEY || YANDEX_MAPS_API_KEY || "";

const SLOTS_FILE = path.join(__dirname, "slots.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const GEOCODE_CACHE_FILE = path.join(__dirname, "geocoded_houses.json");

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

function findExcelFile() {
  const preferred = path.join(__dirname, "doma.xlsx");
  if (fs.existsSync(preferred)) return preferred;

  const files = fs.readdirSync(__dirname);
  const xlsx = files.find((name) => {
    const lower = name.toLowerCase();
    return lower.endsWith(".xlsx") && !lower.startsWith("~$");
  });

  return xlsx ? path.join(__dirname, xlsx) : null;
}

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

function normalizeKey(key) {
  return String(key || "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(row, variants) {
  const entries = Object.entries(row);
  for (const variant of variants) {
    const normalizedVariant = normalizeKey(variant);
    const found = entries.find(([key]) => normalizeKey(key) === normalizedVariant);
    if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim() !== "") {
      return found[1];
    }
  }

  for (const variant of variants) {
    const normalizedVariant = normalizeKey(variant);
    const found = entries.find(([key]) => normalizeKey(key).includes(normalizedVariant));
    if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim() !== "") {
      return found[1];
    }
  }

  return "";
}

function cleanValue(value) {
  return String(value ?? "").trim();
}

function readHousesRaw() {
  const file = findExcelFile();
  if (!file) return [];

  const workbook = XLSX.readFile(file);
  const firstSheet = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function normalizeHouses() {
  const raw = readHousesRaw();

  return raw
    .map((row) => {
      const street = cleanValue(pick(row, [
        "Наименование улице",
        "Наименование улицы",
        "Улица",
        "Адрес",
        "street"
      ]));

      const house = cleanValue(pick(row, [
        "№ дома",
        "Номер дома",
        "Дом",
        "house"
      ]));

      const entrances = cleanValue(pick(row, [
        "кол-во подъездов в доме",
        "Количество подъездов",
        "количество подъездов",
        "Подъездов",
        "entrances"
      ]));

      const floors = cleanValue(pick(row, [
        "этажность",
        "Количество этажей",
        "Этажей",
        "floors"
      ]));

      const flats = cleanValue(pick(row, [
        "Количество квартир",
        "Квартир",
        "квартиры",
        "flats"
      ]));

      const address = street && house ? `${street} д.${house}` : cleanValue(pick(row, ["Адрес", "address"]));

      return {
        street,
        house,
        address,
        entrances,
        floors,
        flats
      };
    })
    .filter((row) => row.address || row.street || row.house);
}

function readGeocodeCache() {
  if (!fs.existsSync(GEOCODE_CACHE_FILE)) return {};

  try {
    return JSON.parse(fs.readFileSync(GEOCODE_CACHE_FILE, "utf8"));
  } catch (_) {
    return {};
  }
}

function writeGeocodeCache(cache) {
  fs.writeFileSync(GEOCODE_CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

async function geocodeAddress(address) {
  if (!YANDEX_GEOCODER_API_KEY) return null;

  const query = `Россия, Республика Татарстан, Нижнекамск, ${address}`;
  const url = new URL("https://geocode-maps.yandex.ru/1.x/");
  url.searchParams.set("apikey", YANDEX_GEOCODER_API_KEY);
  url.searchParams.set("geocode", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("results", "1");

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const member = data?.response?.GeoObjectCollection?.featureMember?.[0];
  const pos = member?.GeoObject?.Point?.pos;
  if (!pos) return null;

  const [lon, lat] = pos.split(" ").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return { lat, lon };
}

async function getHousesWithCoordinates() {
  const houses = normalizeHouses();
  const cache = readGeocodeCache();
  let changed = false;

  for (const house of houses) {
    const key = house.address || `${house.street} ${house.house}`;

    if (cache[key]) {
      house.lat = cache[key].lat;
      house.lon = cache[key].lon;
      continue;
    }

    const coords = await geocodeAddress(house.address);
    if (coords) {
      house.lat = coords.lat;
      house.lon = coords.lon;
      cache[key] = coords;
      changed = true;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  if (changed) writeGeocodeCache(cache);

  return houses;
}

app.get("/api/slots", (req, res) => {
  res.json(readSlots());
});

app.get("/api/houses", (req, res) => {
  res.json(normalizeHouses());
});

app.get("/api/houses-map", async (req, res) => {
  try {
    const houses = await getHousesWithCoordinates();
    res.json(houses);
  } catch (error) {
    res.json(normalizeHouses());
  }
});

app.get("/api/map-config", (req, res) => {
  res.json({
    yandexMapsApiKey: YANDEX_MAPS_API_KEY
  });
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