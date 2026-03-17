const popupMap = {
  about: document.getElementById("popup-about"),
  tariffs: document.getElementById("popup-tariffs"),
  contacts: document.getElementById("popup-contacts"),
  houses: document.getElementById("popup-houses")
};

let slots = [];
let isAdmin = false;

const slotsContainer = document.getElementById("slots");
const adminHint = document.getElementById("adminHint");

/* POPUPS */

document.querySelectorAll(".nav__item").forEach((btn) => {
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
}

function closeAllPopups() {
  Object.values(popupMap).forEach((popup) => {
    popup.classList.remove("is-open");
    popup.setAttribute("aria-hidden", "true");
  });
}

document.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") {
    closeAllPopups();
  }

  if (e.key.toLowerCase() === "a") {
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
      adminHint.hidden = false;
      renderSlots();
      alert("Режим администратора включён");
    } else {
      alert("Неверный пароль");
    }
  }
});

/* SLOTS */

async function initAdminStatus() {
  try {
    const res = await fetch("/api/admin/status");
    const data = await res.json();
    isAdmin = !!data.isAdmin;
    adminHint.hidden = !isAdmin;
  } catch (_) {
    isAdmin = false;
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

    if (!rows.length) {
      wrap.innerHTML = "<p>Список домов пока не загружен.</p>";
      return;
    }

    const keys = Object.keys(rows[0]);
    const groups = splitIntoThree(rows);

    groups.forEach((group) => {
      const col = document.createElement("div");
      col.className = "houses-table-wrap";

      const table = document.createElement("table");
      table.className = "houses-table";

      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      keys.forEach((key) => {
        const th = document.createElement("th");
        th.textContent = key;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      group.forEach((row) => {
        const tr = document.createElement("tr");
        keys.forEach((key) => {
          const td = document.createElement("td");
          td.textContent = row[key];
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      col.appendChild(table);
      wrap.appendChild(col);
    });
  } catch (_) {
    wrap.innerHTML = "<p>Не удалось загрузить список домов.</p>";
  }
}

function splitIntoThree(arr) {
  const size = Math.ceil(arr.length / 3);
  return [
    arr.slice(0, size),
    arr.slice(size, size * 2),
    arr.slice(size * 2)
  ];
}

/* MAP */

const mapFrame = document.getElementById("mapFrame");
const mapImage = document.getElementById("mapImage");

let scale = 1;
let minScale = 1;
let maxScale = 4;
let posX = 0;
let posY = 0;
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;

mapImage.addEventListener("dragstart", (e) => e.preventDefault());

function setupMap() {
  const frameW = mapFrame.clientWidth;
  const frameH = mapFrame.clientHeight;
  const imgW = mapImage.naturalWidth;
  const imgH = mapImage.naturalHeight;

  if (!frameW || !frameH || !imgW || !imgH) return;

  minScale = Math.max(frameW / imgW, frameH / imgH);
  scale = minScale;

  const scaledW = imgW * scale;
  const scaledH = imgH * scale;

  posX = (frameW - scaledW) / 2;
  posY = (frameH - scaledH) / 2;

  applyMapTransform();
}

function clampMap() {
  const frameW = mapFrame.clientWidth;
  const frameH = mapFrame.clientHeight;
  const imgW = mapImage.naturalWidth * scale;
  const imgH = mapImage.naturalHeight * scale;

  const minX = frameW - imgW;
  const minY = frameH - imgH;
  const maxX = 0;
  const maxY = 0;

  posX = Math.min(maxX, Math.max(minX, posX));
  posY = Math.min(maxY, Math.max(minY, posY));
}

function applyMapTransform() {
  clampMap();
  mapImage.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
}

mapFrame.addEventListener("wheel", (e) => {
  e.preventDefault();

  const rect = mapFrame.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const prevScale = scale;
  const factor = e.deltaY < 0 ? 1.12 : 0.88;
  scale *= factor;

  if (scale < minScale) scale = minScale;
  if (scale > maxScale) scale = maxScale;

  const worldX = (mouseX - posX) / prevScale;
  const worldY = (mouseY - posY) / prevScale;

  posX = mouseX - worldX * scale;
  posY = mouseY - worldY * scale;

  applyMapTransform();
}, { passive: false });

mapFrame.addEventListener("mousedown", (e) => {
  dragging = true;
  dragStartX = e.clientX - posX;
  dragStartY = e.clientY - posY;
  mapImage.classList.add("dragging");
});

window.addEventListener("mouseup", () => {
  dragging = false;
  mapImage.classList.remove("dragging");
});

window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  posX = e.clientX - dragStartX;
  posY = e.clientY - dragStartY;
  applyMapTransform();
});

window.addEventListener("resize", setupMap);
mapImage.addEventListener("load", setupMap);

/* INIT */

(async function init() {
  await initAdminStatus();
  await loadSlots();
  await loadHouses();
  if (mapImage.complete) setupMap();
})();