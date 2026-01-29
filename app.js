/* ================= NOTIFICATION ================= */
if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}

/* ================= CONFIG ================= */
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyNhSSPt0SDoz-aktQ4d3rslfXkviQEp7dRN9GCbJVI8Oyi1czpURe8u2lGwmxLYQZvxw/exec";

const MAX_SMOKE = 700;

/* ================= ELEMENTS ================= */
const smokeValueEl  = document.getElementById("smokeValue");
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
/* ================= HELPER: CLEAN TIME STRINGS ================= */
function cleanTimestamp(val) {
  if (!val || val === "--") return "--";
  const str = String(val);
  
  // Remove any Z or timezone indicators
  const cleaned = str.replace("Z", "").replace(".000", "");
  
  // If it's an ISO string (has T), extract time part
  if (cleaned.includes("T")) {
    return cleaned.split("T")[1].split(".")[0];
  }
  
  return cleaned;
}

function cleanDate(val) {
  if (!val || val === "--") return "--";
  const str = String(val);
  
  // If it's an ISO string (has T), extract date part
  if (str.includes("T")) {
    const datePart = str.split("T")[0];
    // Convert from YYYY-MM-DD to DD-MM-YYYY
    const [year, month, day] = datePart.split("-");
    return `${day}-${month}-${year}`;
  }
  
  return str;
}

/* ================= FETCH LATEST ================= */
async function fetchLatest() {
  try {
    const timestamp = new Date().getTime();
    const res = await fetch(`${SCRIPT_URL}?action=latest&_=${timestamp}`);
    const data = await res.json();
    if (!data) return;

    const smoke  = Number(data.smoke || 0);
    const status = Number(data.status || 0);

    /* 🔔 NOTIFICATION */
    if (status === 1 && lastNotifyStatus !== 1) {
      showSmokeNotification(smoke);
    }
    lastNotifyStatus = status;

    /* VALUE - Updates the big number */
    if (smokeValueEl) smokeValueEl.textContent = smoke;

    /* TIME CLEANUP - Safe check added here! */
    if (lastUpdatedEl) {
        const displayDate = cleanDate(data.date);
        const displayTime = cleanTimestamp(data.time);
        lastUpdatedEl.textContent = `Last updated: ${displayDate} ${displayTime}`;
    }

    /* METER - This will now run correctly */
    const percent = Math.min((smoke / MAX_SMOKE) * 100, 100);
    
    if (smokeMeter) {
        smokeMeter.style.width = percent + "%";

        if (smoke < 50) {
          smokeMeter.style.background = "#22c55e"; // Green
          if(meterText) meterText.textContent = "LOW";
        } else if (smoke < 120) {
          smokeMeter.style.background = "#f3dc8f"; // Yellow
          if(meterText) meterText.textContent = "MEDIUM";
        } else {
          smokeMeter.style.background = "#5a1919"; // Red
          if(meterText) meterText.textContent = "HIGH";
        }
    }

  } catch (err) {
    console.error("Latest fetch failed:", err);
  }
}

/* ================= FETCH HISTORY ================= */
async function fetchHistory() {
  try {
    // Add cache-busting
    const timestamp = new Date().getTime();
    const res = await fetch(`${SCRIPT_URL}?action=history&_=${timestamp}`);
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
  const timestamp = new Date().getTime();
  fetch(`${SCRIPT_URL}?action=command&buzzer=0&_=${timestamp}`);
  alert("Buzzer muted");
}

function enableBuzzer() {
  const timestamp = new Date().getTime();
  fetch(`${SCRIPT_URL}?action=command&buzzer=1&_=${timestamp}`);
  alert("Buzzer re-enabled");
}

/* ================= AUTO UPDATE ================= */
// Update more frequently
setInterval(fetchLatest, 1500); // Changed from 1000 to 1500 to reduce load
setInterval(fetchHistory, 8000); // Changed from 5000 to 8000

// Initial load with timeout to avoid blocking
setTimeout(() => {
  fetchLatest();
  fetchHistory();
}, 500);
/* ================= SVG PROXIMITY EFFECT ================= */
const logo = document.getElementById("interactiveLogo");

document.addEventListener("mousemove", (e) => {
  if (!logo) return;

  const rect = logo.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const dx = e.clientX - cx;
  const dy = e.clientY - cy;
  const distance = Math.sqrt(dx * dx + dy * dy);

  const maxDistance = 300;

  if (distance < maxDistance) {
    const strength = (maxDistance - distance) / maxDistance;

    const rotateX = (-dy / 20) * strength;
    const rotateY = (dx / 20) * strength;
    const scale = 1 + strength * 0.12;

    logo.style.transform =
      `perspective(600px)
       rotateX(${rotateX}deg)
       rotateY(${rotateY}deg)
       scale(${scale})`;

    logo.style.filter =
      `drop-shadow(0 ${20 * strength}px ${40 * strength}px rgba(243,220,143,0.6))`;
  } else {
    logo.style.transform =
      "perspective(600px) rotateX(0) rotateY(0) scale(1)";
    logo.style.filter =
      "drop-shadow(0 10px 30px rgba(0,0,0,0.45))";
  }
});
/* ================= SVG PROXIMITY EFFECT ================= */
const svg = document.getElementById("gmuSvg");

if (svg) {
  const core = svg.querySelector(".svg-core");
  const ring = svg.querySelector(".svg-ring");

  document.addEventListener("mousemove", (e) => {
    const rect = svg.getBoundingClientRect();

    const svgX = rect.left + rect.width / 2;
    const svgY = rect.top + rect.height / 2;

    const dx = e.clientX - svgX;
    const dy = e.clientY - svgY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const maxDist = 300; // proximity range
    const intensity = Math.max(0, 1 - distance / maxDist);

    /* Core pulse */
    core.style.transform = `scale(${1 + intensity * 0.15})`;
    core.style.fill = intensity > 0.4 ? "#ffffff" : "#ffffff";

    /* Ring expansion */
    ring.style.transform = `scale(${1 + intensity * 0.25})`;
    ring.style.strokeWidth = 6 + intensity * 6;

    /* Whole SVG subtle lift */
    svg.style.transform = `translateY(${-intensity * 10}px)`;
  });

  document.addEventListener("mouseleave", () => {
    svg.style.transform = "translateY(0)";
    core.style.transform = "scale(1)";
    ring.style.transform = "scale(1)";
  });
}

