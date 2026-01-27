/* ================= NOTIFICATION ================= */
if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}

/* ================= CONFIG ================= */
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbznzNUAqwKwBxfhq2ZFYKePbDoWl0sFywnbV-L9Liis3lTFncGLkPRtId3pezTiDL4b2A/exec";

const MAX_SMOKE = 700;

/* ================= ELEMENTS ================= */
const smokeValueEl  = document.getElementById("smokeValue");
const statusEl      = document.getElementById("status");
const lastUpdatedEl = document.getElementById("lastUpdated");
const historyTable  = document.querySelector("#historyTable tbody");
const smokeMeter    = document.getElementById("smokeMeter");
const meterText     = document.getElementById("meterText");

/* ================= NOTIFICATION CONTROL ================= */
let lastNotifyStatus = 0;

function showSmokeNotification(smokeValue) {
  if (Notification.permission !== "granted") return;

  new Notification("🚨 Smoke Detected!", {
    body: `Smoke level: ${smokeValue}\nLocation: HOD Cabin`,
    icon: "logo.png",
    vibrate: [200, 100, 200],
    requireInteraction: true
  });
}

/* ================= HELPER: CLEAN TIME STRINGS ================= */
function cleanTimestamp(val) {
  if (!val) return "--";
  const str = String(val);
  if (str.includes("T")) {
    return str.split("T")[1].split(".")[0];
  }
  return str;
}

function cleanDate(val) {
  if (!val) return "--";
  const str = String(val);
  if (str.includes("T")) {
    return str.split("T")[0];
  }
  return str;
}

/* ================= FETCH LATEST ================= */
async function fetchLatest() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=latest`);
    const data = await res.json();
    if (!data) return;

    const smoke  = Number(data.smoke || 0);
    const status = Number(data.status || 0);

    /* 🔔 NOTIFICATION */
    if (status === 1 && lastNotifyStatus !== 1) {
      showSmokeNotification(smoke);
    }
    lastNotifyStatus = status;

    /* VALUE */
    smokeValueEl.textContent = smoke;

    /* TIME CLEANUP */
    const displayDate = cleanDate(data.date);
    const displayTime = cleanTimestamp(data.time);
    lastUpdatedEl.textContent = `Last updated: ${displayDate} ${displayTime}`;

    /* STATUS CARD */
    if (status === 1) {
      statusEl.textContent = "SMOKE DETECTED";
      statusEl.className = "status alert";
    } else {
      statusEl.textContent = "NORMAL";
      statusEl.className = "status normal";
    }

    /* METER FIX (Changed MAX_VALUE to MAX_SMOKE) */
    const percent = Math.min((smoke / MAX_SMOKE) * 100, 100);
    smokeMeter.style.width = percent + "%";

    if (smoke < 250) {
      smokeMeter.style.background = "#22c55e";
      meterText.textContent = "LOW";
    } else if (smoke < 400) {
      smokeMeter.style.background = "#f3dc8f";
      meterText.textContent = "MEDIUM";
    } else {
      smokeMeter.style.background = "#5a1919";
      meterText.textContent = "HIGH";
    }

  } catch (err) {
    console.error("Latest fetch failed:", err);
  }
}

/* ================= FETCH HISTORY ================= */
async function fetchHistory() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=history`);
    const rows = await res.json();

    historyTable.innerHTML = "";

    rows.forEach(r => {
      const tr = document.createElement("tr");
      const rowDate = cleanDate(r[3]);
      const rowTime = cleanTimestamp(r[4]);

      tr.innerHTML = `
        <td>${r[0]}</td>
        <td>${r[1]}</td>
        <td>${r[2] == 1 ? "SMOKE" : "CLEAR"}</td>
        <td>${rowDate}</td>
        <td>${rowTime}</td>
        <td>${r[5]}</td>
      `;
      historyTable.appendChild(tr);
    });

  } catch (err) {
    console.error("History fetch failed:", err);
  }
}

/* ================= BUZZER ================= */
function muteBuzzer() {
  fetch(`${SCRIPT_URL}?action=command&buzzer=0`);
  alert("Buzzer muted");
}

function enableBuzzer() {
  fetch(`${SCRIPT_URL}?action=command&buzzer=1`);
  alert("Buzzer re-enabled");
}

/* ================= AUTO UPDATE ================= */
setInterval(fetchLatest, 1000);
setInterval(fetchHistory, 5000);

fetchLatest();
fetchHistory();