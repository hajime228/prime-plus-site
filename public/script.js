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
let markerClusterGroup = null;

async function initYandexMap() {
  // Бесплатная карта OpenStreetMap + Leaflet.
  // Координаты берутся из Excel: G = lat, H = lon.
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
  return L.icon({
    iconUrl: "/icons/map-pin.png",
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -30],
    className: `leaflet-image-pin ${extraClass}`.trim()
  });
}

function createClusterIcon(cluster) {
  const count = cluster.getChildCount();

  let sizeClass = "small";
  if (count >= 10 && count < 50) sizeClass = "medium";
  if (count >= 50) sizeClass = "large";

  return L.divIcon({
    html: `<span>${count}</span>`,
    className: `prime-cluster prime-cluster--${sizeClass}`,
    iconSize: L.point(46, 46)
  });
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

  markerClusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    spiderfyOnMaxZoom: true,
    spiderfyOnEveryZoom: false,
    removeOutsideVisibleBounds: true,
    animate: true,
    maxClusterRadius: 42,
    disableClusteringAtZoom: 18,
    iconCreateFunction: createClusterIcon,
    spiderLegPolylineOptions: {
      weight: 1.5,
      color: "#e60018",
      opacity: 0.65
    }
  });

  try {
    const res = await fetch("/api/houses-map");
    const rows = await res.json();
    const bounds = [];

    rows.forEach((house) => {
      const lat = Number(house.lat);
      const lon = Number(house.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const point = [lat, lon];
      bounds.push(point);

      const address = house.address || formatHouseAddress(house);

      const marker = L.marker(point, { icon: createPinIcon() })
        .bindPopup(makePopupHtml(house));

      markerClusterGroup.addLayer(marker);
      leafletMarkers.push(marker);
      leafletMarkerByAddress.set(normalizeAddressForKey(address), marker);
    });

    leafletMap.addLayer(markerClusterGroup);

    if (bounds.length) {
      leafletMap.fitBounds(bounds, {
        padding: [35, 35],
        maxZoom: 15
      });
    }
  } catch (_) {}
}

function focusHouseOnMap(address) {
  const key = normalizeAddressForKey(address);
  const marker = leafletMarkerByAddress.get(key);

  if (!marker || !leafletMap) return;

  const openMarker = () => {
    const latLng = marker.getLatLng();

    leafletMap.setView(latLng, 18, {
      animate: true
    });

    if (markerClusterGroup) {
      markerClusterGroup.zoomToShowLayer(marker, () => {
        marker.openPopup();

        const iconEl = marker.getElement();
        if (iconEl) {
          iconEl.classList.add("is-active");
          setTimeout(() => iconEl.classList.remove("is-active"), 1800);
        }
      });
    } else {
      marker.openPopup();
    }
  };

  openMarker();
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







/* ================================
   V37: надежное позиционирование тарифов кнопками
   ================================ */

/*
  Теперь без перетаскивания мышкой:
  1) Войти как админ.
  2) Открыть "Тарифы".
  3) В панели выбрать, что двигать: текст A4/A5/A6 или стрелку A4/A5/A6.
  4) Нажимать ← ↑ ↓ →. Шаг 5px.
  5) Нажать "Сохранить".
*/

const defaultTariffPositions = {
  titleA4: { x: 0, y: 0 },
  titleA5: { x: 0, y: 0 },
  titleA6: { x: 0, y: 0 },
  arrowA4: { x: 410, y: 86 },
  arrowA5: { x: 410, y: 176 },
  arrowA6: { x: 410, y: 246 }
};

let tariffPositions = JSON.parse(JSON.stringify(defaultTariffPositions));
const TARIFF_MOVE_STEP = 5;

function getTariffTitleElement(key) {
  return document.querySelector(`#popup-tariffs h3[data-drag-key="${key}"]`);
}

function getTariffBlockByTitleKey(key) {
  const title = getTariffTitleElement(key);
  return title ? title.closest(".tariff-text-block") : null;
}

function getTariffArrowByKey(key) {
  return document.querySelector(`#popup-tariffs .manual-arrow[data-drag-key="${key}"]`);
}

function applyTariffPositions() {
  ["titleA4", "titleA5", "titleA6"].forEach((key) => {
    const block = getTariffBlockByTitleKey(key);
    const pos = tariffPositions[key];

    if (!block || !pos) return;

    block.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  });

  ["arrowA4", "arrowA5", "arrowA6"].forEach((key) => {
    const arrow = getTariffArrowByKey(key);
    const pos = tariffPositions[key];

    if (!arrow || !pos) return;

    arrow.style.left = `${pos.x}px`;
    arrow.style.top = `${pos.y}px`;
  });

  updateSelectedTariffOutline();
}

function updateSelectedTariffOutline() {
  const select = document.getElementById("tariffMoveTarget");
  if (!select) return;

  const selectedKey = select.value;

  document.querySelectorAll("#popup-tariffs [data-drag-key]").forEach((el) => {
    el.classList.toggle("is-selected-for-move", el.dataset.dragKey === selectedKey);
  });

  document.querySelectorAll("#popup-tariffs .tariff-text-block").forEach((block) => {
    const h3 = block.querySelector("h3[data-drag-key]");
    block.classList.toggle("is-selected-for-move", h3 && h3.dataset.dragKey === selectedKey);
  });
}

async function loadTariffPositions() {
  try {
    const res = await fetch("/api/tariff-positions");
    if (!res.ok) throw new Error("no positions");

    const data = await res.json();

    tariffPositions = {
      ...JSON.parse(JSON.stringify(defaultTariffPositions)),
      ...data
    };
  } catch (_) {
    tariffPositions = JSON.parse(JSON.stringify(defaultTariffPositions));
  }

  applyTariffPositions();
}

async function saveTariffPositions() {
  try {
    const res = await fetch("/api/admin/save-tariff-positions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(tariffPositions)
    });

    if (!res.ok) throw new Error("save failed");

    alert("Расположение сохранено");
  } catch (_) {
    alert("Не удалось сохранить расположение");
  }
}

function resetTariffPositions() {
  tariffPositions = JSON.parse(JSON.stringify(defaultTariffPositions));
  applyTariffPositions();
}

function moveSelectedTariffElement(direction) {
  const select = document.getElementById("tariffMoveTarget");
  if (!select) return;

  const key = select.value;

  if (!tariffPositions[key]) {
    tariffPositions[key] = { x: 0, y: 0 };
  }

  if (direction === "left") tariffPositions[key].x -= TARIFF_MOVE_STEP;
  if (direction === "right") tariffPositions[key].x += TARIFF_MOVE_STEP;
  if (direction === "up") tariffPositions[key].y -= TARIFF_MOVE_STEP;
  if (direction === "down") tariffPositions[key].y += TARIFF_MOVE_STEP;

  applyTariffPositions();
}

function updateTariffEditPanel() {
  const panel = document.getElementById("tariffPositionPanel");
  const tariffsPopup = document.getElementById("popup-tariffs");

  if (!panel || !tariffsPopup) return;

  const shouldShow = isAdmin && tariffsPopup.classList.contains("is-open");

  panel.hidden = !shouldShow;
  document.body.classList.toggle("tariff-edit-mode", shouldShow);

  applyTariffPositions();
}

function enableTariffPositionEditor() {
  const saveBtn = document.getElementById("saveTariffPositions");
  const resetBtn = document.getElementById("resetTariffPositions");
  const select = document.getElementById("tariffMoveTarget");

  if (saveBtn) saveBtn.addEventListener("click", saveTariffPositions);
  if (resetBtn) resetBtn.addEventListener("click", resetTariffPositions);
  if (select) select.addEventListener("change", updateSelectedTariffOutline);

  document.querySelectorAll("#tariffPositionPanel [data-move]").forEach((button) => {
    button.addEventListener("click", () => {
      moveSelectedTariffElement(button.dataset.move);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (!document.body.classList.contains("tariff-edit-mode")) return;

    const activeTag = document.activeElement?.tagName?.toLowerCase();
    if (activeTag === "input" || activeTag === "textarea") return;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveSelectedTariffElement("left");
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveSelectedTariffElement("right");
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelectedTariffElement("up");
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelectedTariffElement("down");
    }
  });
}

/* дополняем существующие функции сайта */
const originalOpenPopupForTariffs = openPopup;
openPopup = function patchedOpenPopup(key) {
  originalOpenPopupForTariffs(key);
  updateTariffEditPanel();
};

const originalCloseAllPopupsForTariffs = closeAllPopups;
closeAllPopups = function patchedCloseAllPopups() {
  originalCloseAllPopupsForTariffs();
  updateTariffEditPanel();
};

const originalUpdateAdminUIForTariffs = updateAdminUI;
updateAdminUI = function patchedUpdateAdminUI() {
  originalUpdateAdminUIForTariffs();
  updateTariffEditPanel();
};

enableTariffPositionEditor();
loadTariffPositions();
