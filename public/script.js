const popupMap = {
  about: document.getElementById("popup-about"),
  tariffs: document.getElementById("popup-tariffs"),
  contacts: document.getElementById("popup-contacts"),
  houses: document.getElementById("popup-houses")
};

let slots = [];
let isAdmin = false;
let housesData = [];
let coverageMap = null;
let mapMarkersLayer = null;

const slotsContainer = document.getElementById("slots");
const adminHint = document.getElementById("adminHint");
const adminButton = document.getElementById("adminButton");
const coverageMapElement = document.getElementById("coverageMap");

document.querySelectorAll(".nav__item[data-popup]").forEach((btn) => {
  btn.addEventListener("click", () => {
    openPopup(btn.dataset.popup);
  });
});

document.querySelectorAll("[data-close]").forEach((el) => {
  el.addEventListener("click", closeAllPopups);
});

function openPopup(key) {
  closeAllPopups();
  const popup = popupMap[key];
  if (!popup) return;
  popup.classList.add("is-open");
  popup.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeAllPopups() {
  Object.values(popupMap).forEach((popup) => {
    popup.classList.remove("is-open");
    popup.setAttribute("aria-hidden", "true");
  });
  document.body.classList.remove("modal-open");
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeAllPopups();
  }
});

/* ADMIN */

if (adminButton) {
  adminButton.addEventListener("click", async () => {
    if (!isAdmin) {
      const password = prompt("Введите пароль администратора");
      if (!password) return;

      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ password })
      });

      if (res.ok) {
        isAdmin = true;
        updateAdminUI();
        renderSlots();
        alert("Режим администратора включён");
      } else {
        alert("Неверный пароль");
      }
    } else {
      const res = await fetch("/api/admin/logout", {
        method: "POST"
      });

      if (res.ok) {
        isAdmin = false;
        updateAdminUI();
        renderSlots();
        alert("Режим администратора выключен");
      }
    }
  });
}

function updateAdminUI() {
  adminHint.hidden = !isAdmin;

  if (adminButton) {
    adminButton.innerHTML = isAdmin
      ? "<span>Выйти из режима</span>"
      : "<span>Вход администратора</span>";
  }
}

/* SLOTS */

async function initAdminStatus() {
  try {
    const res = await fetch("/api/admin/status");
    const data = await res.json();
    isAdmin = !!data.isAdmin;
    updateAdminUI();
  } catch (_) {
    isAdmin = false;
    updateAdminUI();
  }
}

async function loadSlots() {
  const res = await fetch("/api/slots");
  slots = await res.json();
  renderSlots();
}

function renderSlots() {
  slotsContainer.innerHTML = "";
  slots.forEach((value, index) => {
    const cell = document.createElement("div");
    cell.className = "slot";
    if (value) cell.classList.add("busy");
    if (isAdmin) cell.classList.add("is-admin");

    cell.addEventListener("click", async () => {
      if (!isAdmin) return;
      slots[index] = slots[index] ? 0 : 1;
      renderSlots();
      await saveSlots();
    });

    slotsContainer.appendChild(cell);
  });
}

async function saveSlots() {
  const res = await fetch("/api/admin/save-slots", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ slots })
  });

  if (!res.ok) {
    alert("Не удалось сохранить слоты");
  }
}

/* HOUSES */

async function loadHouses() {
  const wrap = document.getElementById("housesColumns");
  wrap.innerHTML = "";

  try {
    const res = await fetch("/api/houses");
    const rows = await res.json();
    housesData = rows || [];

    if (!housesData.length) {
      wrap.innerHTML = "<p>Список домов пока не загружен.</p>";
      return;
    }

    renderHousesTable(wrap, housesData);
    await initCoverageMap(housesData);
  } catch (_) {
    wrap.innerHTML = "<p>Не удалось загрузить список домов.</p>";
  }
}

function renderHousesTable(wrap, rows) {
  wrap.innerHTML = "";

  const preferredColumns = getPreferredColumns(rows[0]);
  const tableWrap = document.createElement("div");
  tableWrap.className = "houses-table-wrap";

  const table = document.createElement("table");
  table.className = "houses-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  preferredColumns.forEach((key) => {
    const th = document.createElement("th");
    th.textContent = key;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    preferredColumns.forEach((key) => {
      const td = document.createElement("td");
      td.textContent = normalizeCell(row[key]);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  tableWrap.appendChild(table);
  wrap.appendChild(tableWrap);
}

function getPreferredColumns(sampleRow) {
  const keys = Object.keys(sampleRow || {});
  const priority = [
    "Адрес",
    "Наименование улице",
    "Наименование улицы",
    "Улица",
    "№ дома",
    "№ домa",
    "Дом",
    "кол-во подъездов",
    "Количество подъездов",
    "Этажность",
    "Количество этажей",
    "Количество квартир",
    "Квартиры"
  ];

  const found = priority.filter((name) =>
    keys.some((k) => normalizeKey(k) === normalizeKey(name))
  );

  if (found.length) {
    return found.map((name) => keys.find((k) => normalizeKey(k) === normalizeKey(name)));
  }

  return keys;
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е");
}

function normalizeCell(value) {
  return value === undefined || value === null || value === "" ? "—" : String(value);
}

function getRowValue(row, aliases) {
  const entries = Object.entries(row || {});
  const aliasKeys = aliases.map(normalizeKey);
  for (const [key, value] of entries) {
    if (aliasKeys.includes(normalizeKey(key)) && value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  }
  return "";
}

function buildAddress(row) {
  const readyAddress = getRowValue(row, ["Адрес"]);
  if (readyAddress) return readyAddress;

  const street = getRowValue(row, ["Наименование улице", "Наименование улицы", "Улица"]);
  const house = getRowValue(row, ["№ дома", "Дом", "№ домa"]);
  return [street, house].filter(Boolean).join(", д. ");
}

function buildPopupHtml(row) {
  const address = buildAddress(row) || "Адрес не указан";
  const entrances = getRowValue(row, ["Количество подъездов", "кол-во подъездов", "Подъезды"]);
  const floors = getRowValue(row, ["Количество этажей", "Этажность"]);
  const flats = getRowValue(row, ["Количество квартир", "Квартиры"]);

  const items = [
    `<div><strong>Адрес:</strong> ${address}</div>`
  ];

  if (floors) items.push(`<div><strong>Этажи:</strong> ${floors}</div>`);
  if (entrances) items.push(`<div><strong>Подъезды:</strong> ${entrances}</div>`);
  if (flats) items.push(`<div><strong>Квартиры:</strong> ${flats}</div>`);

  return `<div style="min-width:180px; line-height:1.45;">${items.join("")}</div>`;
}

/* MAP */

function generatePseudoCoords(index, total) {
  const centerLat = 55.6313;
  const centerLng = 51.8140;
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  const radiusLat = 0.028;
  const radiusLng = 0.055;
  const ring = 0.35 + ((index % 7) / 10);

  const lat = centerLat + Math.sin(angle * 1.7) * radiusLat * ring;
  const lng = centerLng + Math.cos(angle * 1.3) * radiusLng * ring;
  return [lat, lng];
}

function createIcon() {
  return L.divIcon({
    className: "custom-house-marker",
    html: `<span style="font-size: 26px; line-height: 1;">📍</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24]
  });
}

async function initCoverageMap(rows) {
  if (!coverageMapElement || typeof L === "undefined") return;

  if (!coverageMap) {
    coverageMap = L.map("coverageMap", {
      scrollWheelZoom: true,
      dragging: true,
      tap: false
    }).setView([55.6313, 51.8140], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: ""
    }).addTo(coverageMap);

    mapMarkersLayer = L.layerGroup().addTo(coverageMap);
  }

  mapMarkersLayer.clearLayers();

  const bounds = [];
  const total = Math.min(rows.length, 80);

  for (let i = 0; i < total; i += 1) {
    const row = rows[i];
    const coords = generatePseudoCoords(i, total);
    bounds.push(coords);

    const marker = L.marker(coords, { icon: createIcon() }).addTo(mapMarkersLayer);
    marker.bindPopup(buildPopupHtml(row));
  }

  if (bounds.length) {
    coverageMap.fitBounds(bounds, { padding: [18, 18] });
  }

  setTimeout(() => coverageMap.invalidateSize(), 200);
}

/* STATIC IMAGE MAP INTERACTION REMOVED */

/* INIT */

(async function init() {
  await initAdminStatus();
  await loadSlots();
  await loadHouses();
})();
