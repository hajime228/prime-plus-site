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

    block.style.setProperty("transform", `translate(${pos.x}px, ${pos.y}px)`, "important");
  });

  ["arrowA4", "arrowA5", "arrowA6"].forEach((key) => {
    const arrow = getTariffArrowByKey(key);
    const pos = tariffPositions[key];

    if (!arrow || !pos) return;

    arrow.style.setProperty("left", `${pos.x}px`, "important");
    arrow.style.setProperty("top", `${pos.y}px`, "important");
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


/* ================================
   V39: редактор текста/размера/ширины/положения
   ================================ */

const designDefaults = {
  heroLead: {
    text: "",
    x: 0,
    y: 0,
    fontSize: "",
    width: "",
    fontFamily: ""
  },
  heroSubhead: {
    text: "",
    x: 0,
    y: 0,
    fontSize: "",
    width: "",
    fontFamily: ""
  },
  coverageTitle: {
    text: "",
    x: 0,
    y: 0,
    fontSize: "",
    width: "",
    fontFamily: ""
  },
  tariffA4: {
    text: "",
    x: 0,
    y: 0,
    fontSize: "",
    width: "",
    fontFamily: ""
  },
  tariffA5: {
    text: "",
    x: 0,
    y: 0,
    fontSize: "",
    width: "",
    fontFamily: ""
  },
  tariffA6: {
    text: "",
    x: 0,
    y: 0,
    fontSize: "",
    width: "",
    fontFamily: ""
  }
};

let designSettings = JSON.parse(JSON.stringify(designDefaults));
let designEditorInitialized = false;

function getDesignElement(key) {
  return document.querySelector(`[data-design-key="${key}"]`);
}

function getEditableTextTarget(key) {
  const el = getDesignElement(key);
  if (!el) return null;

  if (key.startsWith("tariff")) {
    return el;
  }

  return el;
}

function normalizeHtmlFromTextarea(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .join("<br />");
}

function extractTextForTextarea(el) {
  if (!el) return "";
  return el.innerHTML
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function applyDesignSettings() {
  Object.entries(designSettings).forEach(([key, settings]) => {
    const el = getDesignElement(key);
    if (!el || !settings) return;

    if (settings.text) {
      el.innerHTML = normalizeHtmlFromTextarea(settings.text);
    }

    el.style.setProperty("transform", `translate(${Number(settings.x || 0)}px, ${Number(settings.y || 0)}px)`, "important");

    if (settings.fontSize) {
      el.style.setProperty("font-size", `${settings.fontSize}px`, "important");
    } else {
      el.style.removeProperty("font-size");
    }

    if (settings.width) {
      el.style.setProperty("width", `${settings.width}px`, "important");
      el.style.setProperty("max-width", `${settings.width}px`, "important");
    } else {
      el.style.removeProperty("width");
      el.style.removeProperty("max-width");
    }

    if (settings.fontFamily) {
      el.style.setProperty("font-family", settings.fontFamily, "important");
    } else {
      el.style.removeProperty("font-family");
    }
  });

  syncDesignPanelFields();
  updateDesignSelectionOutline();
}

async function loadDesignSettings() {
  // заполняем дефолтный текст из текущей верстки, чтобы сброс не делал пусто
  Object.keys(designDefaults).forEach((key) => {
    const el = getDesignElement(key);
    if (el && !designDefaults[key].text) {
      designDefaults[key].text = extractTextForTextarea(el);
    }
  });

  try {
    const res = await fetch("/api/design-settings");
    if (!res.ok) throw new Error("no settings");
    const data = await res.json();

    designSettings = {
      ...JSON.parse(JSON.stringify(designDefaults)),
      ...data
    };
  } catch (_) {
    designSettings = JSON.parse(JSON.stringify(designDefaults));
  }

  applyDesignSettings();
}

async function saveDesignSettings() {
  try {
    const res = await fetch("/api/admin/save-design-settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(designSettings)
    });

    if (!res.ok) throw new Error("save failed");
    alert("Текст и расположение сохранены");
  } catch (_) {
    alert("Не удалось сохранить настройки текста");
  }
}

function getSelectedDesignKey() {
  return document.getElementById("designElementSelect")?.value || "heroLead";
}

function readDesignPanelFields() {
  const key = getSelectedDesignKey();

  if (!designSettings[key]) {
    designSettings[key] = JSON.parse(JSON.stringify(designDefaults[key] || {}));
  }

  designSettings[key].text = document.getElementById("designTextInput")?.value || "";
  designSettings[key].fontSize = document.getElementById("designFontSize")?.value || "";
  designSettings[key].width = document.getElementById("designWidth")?.value || "";
  designSettings[key].x = Number(document.getElementById("designX")?.value || 0);
  designSettings[key].y = Number(document.getElementById("designY")?.value || 0);
  designSettings[key].fontFamily = document.getElementById("designFontFamily")?.value || "";
}

function syncDesignPanelFields() {
  const key = getSelectedDesignKey();
  const settings = designSettings[key] || designDefaults[key];
  const el = getDesignElement(key);

  const textInput = document.getElementById("designTextInput");
  const fontSizeInput = document.getElementById("designFontSize");
  const widthInput = document.getElementById("designWidth");
  const xInput = document.getElementById("designX");
  const yInput = document.getElementById("designY");
  const fontFamilyInput = document.getElementById("designFontFamily");

  if (textInput) textInput.value = settings.text || extractTextForTextarea(el);
  if (fontSizeInput) fontSizeInput.value = settings.fontSize || "";
  if (widthInput) widthInput.value = settings.width || "";
  if (xInput) xInput.value = settings.x || 0;
  if (yInput) yInput.value = settings.y || 0;
  if (fontFamilyInput) fontFamilyInput.value = settings.fontFamily || "";
}

function updateDesignSelectionOutline() {
  const selected = getSelectedDesignKey();

  document.querySelectorAll("[data-design-key]").forEach((el) => {
    el.classList.toggle("is-design-selected", el.dataset.designKey === selected);
  });
}

function moveSelectedDesignElement(direction) {
  const key = getSelectedDesignKey();

  if (!designSettings[key]) {
    designSettings[key] = JSON.parse(JSON.stringify(designDefaults[key] || {}));
  }

  const step = 5;

  if (direction === "left") designSettings[key].x = Number(designSettings[key].x || 0) - step;
  if (direction === "right") designSettings[key].x = Number(designSettings[key].x || 0) + step;
  if (direction === "up") designSettings[key].y = Number(designSettings[key].y || 0) - step;
  if (direction === "down") designSettings[key].y = Number(designSettings[key].y || 0) + step;

  applyDesignSettings();
}

function resetSelectedDesignElement() {
  const key = getSelectedDesignKey();
  designSettings[key] = JSON.parse(JSON.stringify(designDefaults[key] || {}));
  applyDesignSettings();
}

function updateDesignEditorVisibility() {
  const panel = document.getElementById("designEditorPanel");
  const toggle = document.getElementById("openDesignEditor");

  if (!panel) return;

  const shouldAllow = !!isAdmin;

  document.body.classList.toggle("design-edit-mode", shouldAllow && !panel.hidden);

  if (toggle) toggle.hidden = !shouldAllow;
  if (!shouldAllow) panel.hidden = true;

  updateDesignSelectionOutline();
}

function ensureDesignEditorToggle() {
  if (document.getElementById("openDesignEditor")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "openDesignEditor";
  btn.className = "design-editor-toggle";
  btn.textContent = "Редактировать текст";
  btn.hidden = true;
  document.body.appendChild(btn);

  btn.addEventListener("click", () => {
    const panel = document.getElementById("designEditorPanel");
    if (!panel) return;

    panel.hidden = false;
    updateDesignEditorVisibility();
    syncDesignPanelFields();
  });
}

function enableDesignEditor() {
  if (designEditorInitialized) return;
  designEditorInitialized = true;

  ensureDesignEditorToggle();

  const panel = document.getElementById("designEditorPanel");
  const closeBtn = document.getElementById("closeDesignEditor");
  const select = document.getElementById("designElementSelect");

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      if (panel) panel.hidden = true;
      updateDesignEditorVisibility();
    });
  }

  if (select) {
    select.addEventListener("change", () => {
      syncDesignPanelFields();
      updateDesignSelectionOutline();
    });
  }

  document.getElementById("applyDesignSettings")?.addEventListener("click", () => {
    readDesignPanelFields();
    applyDesignSettings();
  });

  document.getElementById("saveDesignSettings")?.addEventListener("click", async () => {
    readDesignPanelFields();
    applyDesignSettings();
    await saveDesignSettings();
  });

  document.getElementById("resetDesignElement")?.addEventListener("click", resetSelectedDesignElement);

  document.querySelectorAll("[data-design-move]").forEach((button) => {
    button.addEventListener("click", () => {
      readDesignPanelFields();
      moveSelectedDesignElement(button.dataset.designMove);
    });
  });

  ["designTextInput", "designFontSize", "designWidth", "designX", "designY", "designFontFamily"].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;

    input.addEventListener("input", () => {
      readDesignPanelFields();
      applyDesignSettings();
    });
  });

  document.querySelectorAll("[data-design-key]").forEach((el) => {
    el.addEventListener("click", () => {
      if (!document.body.classList.contains("design-edit-mode")) return;

      const select = document.getElementById("designElementSelect");
      if (select) {
        select.value = el.dataset.designKey;
        syncDesignPanelFields();
        updateDesignSelectionOutline();
      }
    });
  });
}

const originalUpdateAdminUIForDesignEditor = updateAdminUI;
updateAdminUI = function patchedUpdateAdminUIForDesignEditor() {
  originalUpdateAdminUIForDesignEditor();
  updateDesignEditorVisibility();
};

enableDesignEditor();
loadDesignSettings();


/* ================================
   V40: проверка и фикс редактора текста тарифов
   ================================ */

/*
  Важно:
  для тарифов нельзя заменять innerHTML всего .tariff-text-block,
  иначе пропадают h3[data-drag-key] и ломается перемещение.
  Поэтому:
  - первая строка textarea = заголовок h3;
  - остальные строки = описание p;
  - структура блока сохраняется.
*/

function escapeDesignHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function textareaToHtmlLines(value) {
  return String(value || "")
    .split("\n")
    .map((line) => escapeDesignHtml(line.trim()))
    .join("<br />");
}

function extractDesignText(key) {
  const el = getDesignElement(key);
  if (!el) return "";

  if (key.startsWith("tariff")) {
    const h3 = el.querySelector("h3");
    const p = el.querySelector("p");

    return [
      h3 ? h3.textContent.trim() : "",
      p ? p.textContent.trim() : ""
    ].filter(Boolean).join("\n");
  }

  return el.innerHTML
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function setDesignText(key, text) {
  const el = getDesignElement(key);
  if (!el) return;

  if (key.startsWith("tariff")) {
    let h3 = el.querySelector("h3");
    let p = el.querySelector("p");

    if (!h3) {
      h3 = document.createElement("h3");
      if (key === "tariffA4") h3.dataset.dragKey = "titleA4";
      if (key === "tariffA5") h3.dataset.dragKey = "titleA5";
      if (key === "tariffA6") h3.dataset.dragKey = "titleA6";
      el.prepend(h3);
    }

    if (!p) {
      p = document.createElement("p");
      el.appendChild(p);
    }

    const lines = String(text || "").split("\n");
    const title = lines.shift() || h3.textContent || "";
    const body = lines.join("\n");

    h3.innerHTML = escapeDesignHtml(title);
    p.innerHTML = textareaToHtmlLines(body);

    return;
  }

  el.innerHTML = textareaToHtmlLines(text);
}

function applyDesignSettings() {
  Object.entries(designSettings).forEach(([key, settings]) => {
    const el = getDesignElement(key);
    if (!el || !settings) return;

    if (settings.text) {
      setDesignText(key, settings.text);
    }

    el.style.setProperty("transform", `translate(${Number(settings.x || 0)}px, ${Number(settings.y || 0)}px)`, "important");

    if (settings.fontSize) {
      el.style.setProperty("font-size", `${settings.fontSize}px`, "important");
    } else {
      el.style.removeProperty("font-size");
    }

    if (settings.width) {
      el.style.setProperty("width", `${settings.width}px`, "important");
      el.style.setProperty("max-width", `${settings.width}px`, "important");
    } else {
      el.style.removeProperty("width");
      el.style.removeProperty("max-width");
    }

    if (settings.fontFamily) {
      el.style.setProperty("font-family", settings.fontFamily, "important");
    } else {
      el.style.removeProperty("font-family");
    }
  });

  syncDesignPanelFields();
  updateDesignSelectionOutline();
  if (typeof applyTariffPositions === "function") applyTariffPositions();
}

function syncDesignPanelFields() {
  const key = getSelectedDesignKey();
  const settings = designSettings[key] || designDefaults[key];

  const textInput = document.getElementById("designTextInput");
  const fontSizeInput = document.getElementById("designFontSize");
  const widthInput = document.getElementById("designWidth");
  const xInput = document.getElementById("designX");
  const yInput = document.getElementById("designY");
  const fontFamilyInput = document.getElementById("designFontFamily");

  if (textInput) textInput.value = settings.text || extractDesignText(key);
  if (fontSizeInput) fontSizeInput.value = settings.fontSize || "";
  if (widthInput) widthInput.value = settings.width || "";
  if (xInput) xInput.value = settings.x || 0;
  if (yInput) yInput.value = settings.y || 0;
  if (fontFamilyInput) fontFamilyInput.value = settings.fontFamily || "";
}

function loadDesignDefaultTextsSafely() {
  Object.keys(designDefaults).forEach((key) => {
    if (!designDefaults[key].text) {
      designDefaults[key].text = extractDesignText(key);
    }
  });
}

const originalLoadDesignSettingsV40 = loadDesignSettings;
loadDesignSettings = async function patchedLoadDesignSettingsV40() {
  loadDesignDefaultTextsSafely();

  try {
    const res = await fetch("/api/design-settings");
    if (!res.ok) throw new Error("no settings");

    const data = await res.json();

    designSettings = {
      ...JSON.parse(JSON.stringify(designDefaults)),
      ...data
    };
  } catch (_) {
    designSettings = JSON.parse(JSON.stringify(designDefaults));
  }

  applyDesignSettings();
};


/* ================================
   V43: фикс кнопки "Вход администратора"
   ================================ */

let adminLoginClickLock = false;

async function handleAdminButtonClickV43(event) {
  const button = event.target.closest?.("#adminButton");
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();

  if (adminLoginClickLock) return;
  adminLoginClickLock = true;

  try {
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
  } finally {
    setTimeout(() => {
      adminLoginClickLock = false;
    }, 250);
  }
}

/* capture=true: обработчик сработает даже если что-то поверх/раньше мешает */
document.addEventListener("click", handleAdminButtonClickV43, true);
