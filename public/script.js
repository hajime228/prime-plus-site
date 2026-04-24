const popupMap = {
  about: document.getElementById("popup-about"),
  tariffs: document.getElementById("popup-tariffs"),
  contacts: document.getElementById("popup-contacts"),
  houses: document.getElementById("popup-houses")
};

let slots = [];
let isAdmin = false;
let housesCache = [];
let yandexMap = null;
let yandexObjects = [];

const slotsContainer = document.getElementById("slots");
const adminHint = document.getElementById("adminHint");
const adminButton = document.getElementById("adminButton");

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
    if (!popup) return;
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
  if (adminHint) {
    adminHint.hidden = !isAdmin;
  }

  if (adminButton) {
    adminButton.innerHTML = isAdmin
      ? "<span>Выйти из режима</span>"
      : "<span>Вход администратора</span>";
  }
}

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
  if (!slotsContainer) return;

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

async function loadHouses() {
  try {
    const res = await fetch("/api/houses");
    housesCache = await res.json();

    renderHousesList(housesCache);
  } catch (_) {
    housesCache = [];
    renderHousesList([]);
  }
}

function renderHousesList(rows) {
  const wrap = document.getElementById("housesList");
  const search = document.getElementById("houseSearch");

  if (!wrap) return;

  function draw(list) {
    wrap.innerHTML = "";

    if (!list.length) {
      wrap.innerHTML = "<p>Ничего не найдено.</p>";
      return;
    }

    list.forEach((row) => {
      const item = document.createElement("div");
      item.className = "house-row";

      const address = row.address || formatHouseAddress(row);
      const entrances = row.entrances || row.podezdy || row["количество подъездов"] || "";
      const floors = row.floors || row.etazhi || row["этажность"] || "";
      const flats = row.flats || row.kvartiry || row["квартир"] || "";

      item.innerHTML = `
        <div class="house-address">
          <span class="house-pin"></span>
          <button class="house-address__btn" type="button">${escapeHtml(address)}</button>
        </div>
        <div class="house-center">${escapeHtml(String(entrances || ""))}</div>
        <div class="house-center">${escapeHtml(String(floors || flats || ""))}</div>
      `;

      const btn = item.querySelector(".house-address__btn");
      if (btn) {
        btn.addEventListener("click", () => {
          focusHouseOnMap(address);
          closeAllPopups();
        });
      }

      wrap.appendChild(item);
    });
  }

  draw(rows);

  if (search && !search.dataset.bound) {
    search.dataset.bound = "true";
    search.addEventListener("input", () => {
      const query = normalizeAddressForKey(search.value);

      if (!query) {
        draw(housesCache);
        return;
      }

      const filtered = housesCache.filter((row) => {
        const address = row.address || formatHouseAddress(row);
        return normalizeAddressForKey(address).includes(query);
      });

      draw(filtered);
    });
  }
}

function formatHouseAddress(row) {
  const street = row.street || row.ulica || row["наименование улице"] || row["наименование улицы"] || row["улица"] || "";
  const house = row.house || row.dom || row["№ дома"] || row["номер дома"] || "";
  return `${street} д.${house}`.trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let leafletMap = null;
let leafletMarkers = [];
let leafletMarkerByAddress = new Map();

async function initYandexMap() {
  await initFreeLeafletMap();
}

function normalizeAddressForKey(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ")
    .trim();
}

function makePopupHtml(house) {
  const address = house.address || formatHouseAddress(house);
  return `
    <div class="map-popup">
      <div class="map-popup__title">Адрес: ${escapeHtml(address)}</div>
      <div>Этажность: ${escapeHtml(String(house.floors || "—"))}</div>
      <div>Подъездов: ${escapeHtml(String(house.entrances || "—"))}</div>
      <div>Квартир: ${escapeHtml(String(house.flats || "—"))}</div>
    </div>
  `;
}

function createPinIcon(extraClass = "") {
  return L.divIcon({
    className: `leaflet-custom-pin ${extraClass}`.trim(),
    html: "<span></span>",
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    popupAnchor: [0, -40]
  });
}

function createClusterIcon(count) {
  return L.divIcon({
    className: "leaflet-cluster-pin",
    html: `<span>${count}</span>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21]
  });
}

function clusterHouses(rows) {
  const precision = 3;
  const clusters = new Map();

  rows.forEach((house) => {
    const lat = Number(house.lat);
    const lon = Number(house.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const key = `${lat.toFixed(precision)}_${lon.toFixed(precision)}`;

    if (!clusters.has(key)) {
      clusters.set(key, { latSum: 0, lonSum: 0, items: [] });
    }

    const cluster = clusters.get(key);
    cluster.latSum += lat;
    cluster.lonSum += lon;
    cluster.items.push(house);
  });

  return [...clusters.values()].map((cluster) => ({
    lat: cluster.latSum / cluster.items.length,
    lon: cluster.lonSum / cluster.items.length,
    items: cluster.items
  }));
}

async function initFreeLeafletMap() {
  const mapEl = document.getElementById("map");
  const fallback = document.getElementById("mapFallback");

  if (!mapEl || !window.L) {
    if (mapEl) mapEl.hidden = true;
    if (fallback) fallback.hidden = false;
    return;
  }

  if (fallback) fallback.hidden = true;
  mapEl.hidden = false;

  leafletMap = L.map("map", {
    scrollWheelZoom: false,
    dragging: true,
    tap: false,
    zoomControl: true
  }).setView([55.6311, 51.8149], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: ""
  }).addTo(leafletMap);

  try {
    const res = await fetch("/api/houses-map");
    const rows = await res.json();
    const clusters = clusterHouses(rows);
    const bounds = [];

    clusters.forEach((cluster) => {
      const point = [cluster.lat, cluster.lon];
      bounds.push(point);

      if (cluster.items.length === 1) {
        const house = cluster.items[0];
        const address = house.address || formatHouseAddress(house);

        const marker = L.marker(point, { icon: createPinIcon() })
          .addTo(leafletMap)
          .bindPopup(makePopupHtml(house));

        leafletMarkers.push(marker);
        leafletMarkerByAddress.set(normalizeAddressForKey(address), marker);
      } else {
        const marker = L.marker(point, { icon: createClusterIcon(cluster.items.length) })
          .addTo(leafletMap)
          .bindPopup(`
            <div class="map-popup">
              <div class="map-popup__title">Домов рядом: ${cluster.items.length}</div>
              <div>Нажмите на кластер, чтобы приблизить карту.</div>
            </div>
          `);

        marker.on("click", () => {
          leafletMap.setView(point, Math.min(leafletMap.getZoom() + 2, 18), { animate: true });
        });

        leafletMarkers.push(marker);

        cluster.items.forEach((house) => {
          const address = house.address || formatHouseAddress(house);
          leafletMarkerByAddress.set(normalizeAddressForKey(address), marker);
        });
      }
    });

    if (bounds.length) {
      leafletMap.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
    }
  } catch (_) {}
}

function focusHouseOnMap(address) {
  const key = normalizeAddressForKey(address);
  const marker = leafletMarkerByAddress.get(key);

  if (!marker || !leafletMap) return;

  const latLng = marker.getLatLng();

  leafletMap.setView(latLng, Math.max(leafletMap.getZoom(), 16), {
    animate: true
  });

  marker.openPopup();

  const iconEl = marker.getElement();
  if (iconEl) {
    iconEl.classList.add("is-active");
    setTimeout(() => iconEl.classList.remove("is-active"), 1800);
  }
}

const logo = document.querySelector(".brand__logo");
if (logo) {
  logo.addEventListener("dragstart", (e) => e.preventDefault());
}

document.querySelectorAll("img").forEach((img) => {
  img.addEventListener("dragstart", (e) => e.preventDefault());
});

(async function init() {
  await initAdminStatus();
  await loadSlots();
  await loadHouses();
  await initYandexMap();
})();