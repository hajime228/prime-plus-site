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
  if (!wrap) return;

  wrap.innerHTML = "";

  if (!rows.length) {
    wrap.innerHTML = "<p>Список домов пока не загружен.</p>";
    return;
  }

  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "house-row";

    const address = row.address || formatHouseAddress(row);
    const entrances = row.entrances || row.podezdy || row["количество подъездов"] || "";
    const floors = row.floors || row.etazhi || row["этажность"] || "";
    const flats = row.flats || row.kvartiry || row["квартир"] || "";

    item.innerHTML = `
      <div class="house-address">
        <span class="house-pin">📍</span>
        <span>${escapeHtml(address)}</span>
      </div>
      <div class="house-center">${escapeHtml(String(entrances || ""))}</div>
      <div class="house-center">${escapeHtml(String(floors || flats || ""))}</div>
    `;

    wrap.appendChild(item);
  });
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

async function initYandexMap() {
  const mapEl = document.getElementById("map");
  const fallback = document.getElementById("mapFallback");

  if (!mapEl) return;

  try {
    const configRes = await fetch("/api/map-config");
    const config = await configRes.json();

    if (!config.yandexMapsApiKey) {
      showFallbackMap();
      return;
    }

    await loadYandexScript(config.yandexMapsApiKey);

    ymaps.ready(async () => {
      yandexMap = new ymaps.Map("map", {
        center: [55.6311, 51.8149],
        zoom: 12,
        controls: ["zoomControl", "fullscreenControl"]
      }, {
        suppressMapOpenBlock: true,
        yandexMapDisablePoiInteractivity: true
      });

      yandexMap.behaviors.disable("scrollZoom");
      yandexMap.behaviors.enable(["drag", "multiTouch"]);

      await loadMapHouses();
    });
  } catch (_) {
    showFallbackMap();
  }

  function showFallbackMap() {
    if (mapEl) mapEl.hidden = true;
    if (fallback) fallback.hidden = false;
  }
}

function loadYandexScript(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.ymaps) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function loadMapHouses() {
  if (!yandexMap) return;

  try {
    const res = await fetch("/api/houses-map");
    const rows = await res.json();

    yandexObjects.forEach((object) => {
      yandexMap.geoObjects.remove(object);
    });
    yandexObjects = [];

    const coords = [];

    rows.forEach((house) => {
      if (!house.lat || !house.lon) return;

      const point = [Number(house.lat), Number(house.lon)];
      coords.push(point);

      const address = house.address || formatHouseAddress(house);
      const floors = house.floors || "";
      const entrances = house.entrances || "";
      const flats = house.flats || "";

      const placemark = new ymaps.Placemark(point, {
        balloonContent: `
          <div style="font-family: Arial, sans-serif; min-width: 190px;">
            <div style="font-size:18px;font-weight:700;color:#1a537d;margin-bottom:8px;">
              Адрес: ${escapeHtml(address)}
            </div>
            <div style="font-size:15px;color:#1a537d;font-weight:700;">
              Этажность: ${escapeHtml(String(floors || "—"))}<br>
              Подъездов: ${escapeHtml(String(entrances || "—"))}<br>
              Квартир: ${escapeHtml(String(flats || "—"))}
            </div>
          </div>
        `,
        hintContent: `${address}`
      }, {
        preset: "islands#redDotIcon",
        hideIconOnBalloonOpen: false
      });

      yandexMap.geoObjects.add(placemark);
      yandexObjects.push(placemark);
    });

    if (coords.length) {
      yandexMap.setBounds(yandexMap.geoObjects.getBounds(), {
        checkZoomRange: true,
        zoomMargin: 45
      });
    }
  } catch (_) {}
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