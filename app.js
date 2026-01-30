

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw3YyF-hXbhDXkRosy0z45xUEvJViwqaT2-qBdSTj8JiBytKnCBl3EXoqkt3Xozm5g8/exec";
const UPDATE_INTERVAL = 3000;

// Notification state
let notificationPermission = false;
let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN = 600000; // 10 minutes between notifications
let lastSmokeStatus = false; // Track to detect transitions

let lastData = null;
let updateTimer = null;
let commandInProgress = false;
let lastUpdateTime = 0;

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard starting...');
    
    // Setup notifications
    initNotifications();
    
    startDataUpdates();
    loadHistory();
    
    document.getElementById('muteBtn')?.addEventListener('click', () => sendCommand(0));
    document.getElementById('enableBtn')?.addEventListener('click', () => sendCommand(1));
});

/* ================= BROWSER NOTIFICATIONS ================= */

function initNotifications() {
    if (!("Notification" in window)) {
        console.log("Browser does not support notifications");
        updateNotificationStatus("unsupported");
        return;
    }
    
    // Check permission
    if (Notification.permission === "granted") {
        notificationPermission = true;
        updateNotificationStatus("enabled");
    } else if (Notification.permission !== "denied") {
        // Request permission
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                notificationPermission = true;
                updateNotificationStatus("enabled");
                showToast("Notifications enabled!", "success");
            } else {
                updateNotificationStatus("disabled");
            }
        });
    } else {
        updateNotificationStatus("blocked");
    }
}

function updateNotificationStatus(status) {
    const indicator = document.getElementById('notificationStatus');
    if (!indicator) return;
    
    if (status === "enabled") {
        indicator.innerHTML = "🔔 Notifications On";
        indicator.style.cssText = "color: #006600; background: #90EE90; padding: 5px 10px; border-radius: 5px; font-size: 0.8em;";
    } else if (status === "disabled" || status === "blocked") {
        indicator.innerHTML = "🔕 Notifications Off";
        indicator.style.cssText = "color: #666; background: #eee; padding: 5px 10px; border-radius: 5px; font-size: 0.8em;";
    } else {
        indicator.innerHTML = "⚠️ Notifications Unsupported";
        indicator.style.cssText = "color: #999; background: #f5f5f5; padding: 5px 10px; border-radius: 5px; font-size: 0.8em;";
    }
}

function sendSmokeNotification(smokeValue, deviceName) {
    if (!notificationPermission) return;
    
    const now = Date.now();
    
    // Prevent spam: Only notify once every 10 minutes for same event type
    if (now - lastNotificationTime < NOTIFICATION_COOLDOWN) {
        console.log("Notification skipped (cooldown)");
        return;
    }
    
    // Optionally: Only notify if tab is not visible
    // if (document.visibilityState === 'visible') return;
    
    const notification = new Notification("🚨 SMOKE DETECTED!", {
        body: `Smoke level: ${smokeValue} at ${deviceName || 'GMU HOD Cabin'}\nClick to view dashboard`,
        icon: "https://cdn-icons-png.flaticon.com/512/2933/2933245.png", // Smoke/fire icon
        badge: "https://cdn-icons-png.flaticon.com/512/2933/2933245.png",
        tag: "smoke-alert", // Prevents duplicate notifications
        requireInteraction: true, // Stays until user clicks
        silent: false,
        vibrate: [200, 100, 200]
    });
    
    notification.onclick = function() {
        window.focus();
        notification.close();
    };
    
    lastNotificationTime = now;
    console.log("Smoke notification sent");
}

/* ================= DATA UPDATES ================= */

function startDataUpdates() {
    updateData();
    updateTimer = setInterval(updateData, UPDATE_INTERVAL);
    setInterval(loadHistory, 15000);
}

async function updateData() {
    if (commandInProgress) return;
    
    try {
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=latest&_=${Date.now()}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const previousSmoke = lastData?.status === "1";
        lastData = data;
        lastUpdateTime = Date.now();
        
        // Check for smoke START transition (for notification)
        const currentSmoke = data.status === "1" || data.status === 1;
        if (currentSmoke && !previousSmoke && !lastSmokeStatus) {
            // New smoke event detected
            sendSmokeNotification(data.smoke, data.device);
        }
        lastSmokeStatus = currentSmoke;
        
        updateUI(data);
    } catch (error) {
        console.error('Update error:', error);
        if (lastData) {
            lastData.online = false;
            updateUI(lastData);
        }
    }
}

/* ================= UI UPDATES ================= */

function updateUI(data) {
    const isOnline = data.online === true && parseInt(data.seconds_since_update) < 35;
    const isSmoke = parseInt(data.status) === 1;
    const smokeVal = parseInt(data.smoke) || 0;
    const isMuted = data.buzzer_state === "0";
    const secondsSince = parseInt(data.seconds_since_update) || 999;
    
    // System Status
    const sysStatusEl = document.getElementById('systemStatus');
    if (sysStatusEl) {
        if (isOnline) {
            sysStatusEl.innerHTML = '🟢 System Online';
            sysStatusEl.style.cssText = 'color: #000; background: #90EE90; padding: 8px 16px; border-radius: 20px; font-weight: bold; display: inline-block;';
        } else {
            const mins = Math.floor(secondsSince / 60);
            const timeStr = mins > 0 ? `${mins}m ago` : `${secondsSince}s ago`;
            sysStatusEl.innerHTML = `🔴 Offline (${timeStr})`;
            sysStatusEl.style.cssText = 'color: #000; background: #FFB6C1; padding: 8px 16px; border-radius: 20px; font-weight: bold; display: inline-block;';
        }
    }
    
    // Device status
    const devStatusEl = document.getElementById('deviceStatus');
    if (devStatusEl) {
        devStatusEl.innerHTML = isOnline ? '🟢 Device Active' : '⚪ Device Offline';
        devStatusEl.style.cssText = isOnline ? 'color: #000; font-weight: bold;' : 'color: #666;';
    }
    
    // Last update
    const lastUpdEl = document.getElementById('lastUpdated');
    if (lastUpdEl) {
        lastUpdEl.textContent = isOnline ? `Live: ${data.time}` : `Last seen: ${data.time}`;
        lastUpdEl.style.color = '#000';
    }
    
    // Smoke value
    const smokeEl = document.getElementById('smokeValue');
    if (smokeEl) {
        if (!isOnline) {
            smokeEl.textContent = "N/A";
            smokeEl.style.cssText = 'color: #000; font-size: 4em; font-weight: bold;';
        } else {
            smokeEl.textContent = smokeVal;
            if (isSmoke || smokeVal > 140) {
                smokeEl.style.cssText = 'color: #CC0000; font-size: 4em; font-weight: bold; animation: pulse 1s infinite;';
            } else if (smokeVal > 80) {
                smokeEl.style.cssText = 'color: #CC6600; font-size: 4em; font-weight: bold;';
            } else {
                smokeEl.style.cssText = 'color: #006600; font-size: 4em; font-weight: bold;';
            }
        }
    }
    
    // Progress meter
    const meterEl = document.getElementById('smokeMeter');
    const meterText = document.getElementById('meterText');
    if (meterEl && meterText) {
        if (!isOnline) {
            meterEl.style.width = '0%';
            meterEl.style.background = '#ccc';
            meterText.textContent = 'OFFLINE';
            meterText.style.color = '#000';
        } else {
            const pct = Math.min((smokeVal / 400) * 100, 100);
            meterEl.style.width = pct + '%';
            
            if (isSmoke || smokeVal > 140) {
                meterEl.style.background = '#CC0000';
                meterText.textContent = 'HIGH';
            } else if (smokeVal > 80) {
                meterEl.style.background = '#CC6600';
                meterText.textContent = 'MEDIUM';
            } else {
                meterEl.style.background = '#006600';
                meterText.textContent = 'LOW';
            }
            meterText.style.color = '#FFF';
        }
    }
    
    // Info fields
    const fields = {
        'smokeStatus': isOnline ? data.status_text : '--',
        'deviceId': data.device || 'Unknown',
        'wifiName': data.wifi || 'Unknown',
        'rssiValue': data.rssi ? `${data.rssi} dBm` : '--',
        'lastEvent': data.reason || '--'
    };
    
    for (const [id, value] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
            el.style.cssText = 'color: #000; font-weight: normal;';
        }
    }
    
    // Buzzer state
    const buzzerEl = document.getElementById('buzzerState');
    if (buzzerEl) {
        buzzerEl.textContent = isMuted ? 'MUTED' : 'ACTIVE';
        buzzerEl.style.cssText = isMuted ? 'color: #CC0000; font-weight: bold;' : 'color: #006600; font-weight: bold;';
    }
    
    updateButtons(isOnline, isMuted);
}

function updateButtons(online, muted) {
    const muteBtn = document.getElementById('muteBtn');
    const enableBtn = document.getElementById('enableBtn');
    
    if (!muteBtn || !enableBtn) return;
    
    if (!online || commandInProgress) {
        muteBtn.disabled = true;
        enableBtn.disabled = true;
        muteBtn.style.opacity = '0.5';
        enableBtn.style.opacity = '0.5';
        return;
    }
    
    muteBtn.disabled = false;
    enableBtn.disabled = false;
    muteBtn.style.opacity = '1';
    enableBtn.style.opacity = '1';
    
    if (muted) {
        muteBtn.textContent = '🔕 MUTED';
        muteBtn.style.cssText = 'background: #666; color: #FFF; padding: 15px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; margin: 5px;';
        enableBtn.textContent = '🔔 ENABLE BUZZER';
        enableBtn.style.cssText = 'background: #006600; color: #FFF; padding: 15px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; margin: 5px;';
    } else {
        muteBtn.textContent = '🔕 MUTE BUZZER';
        muteBtn.style.cssText = 'background: #CC0000; color: #FFF; padding: 15px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; margin: 5px;';
        enableBtn.textContent = '🔔 ENABLED';
        enableBtn.style.cssText = 'background: #666; color: #FFF; padding: 15px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; margin: 5px;';
    }
}

async function sendCommand(buzzerState) {
    if (!lastData || !lastData.online) {
        alert('Device offline!');
        return;
    }
    
    commandInProgress = true;
    const btn = buzzerState === 0 ? document.getElementById('muteBtn') : document.getElementById('enableBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Processing...';
    
    try {
        const url = `${GOOGLE_SCRIPT_URL}?action=command&buzzer=${buzzerState}&source=dashboard&device=${lastData.device || ''}&_=${Date.now()}`;
        const response = await fetch(url);
        const result = await response.text();
        
        if (result.includes('SUCCESS')) {
            lastData.buzzer_state = buzzerState.toString();
            updateUI(lastData);
            setTimeout(updateData, 1000);
        }
    } catch (error) {
        console.error('Command error:', error);
    } finally {
        commandInProgress = false;
        btn.textContent = originalText;
        updateButtons(lastData?.online, buzzerState === 0);
    }
}

/* ================= HISTORY TABLE ================= */

async function loadHistory() {
    try {
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=history&_=${Date.now()}`);
        const data = await response.json();
        const tbody = document.querySelector('#historyTable tbody');
        
        if (!tbody) return;
        
        if (!Array.isArray(data) || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color: #000;">No events recorded</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.map(row => {
            // ONLY 6 COLUMNS: ID, Smoke, Status, Date, Time, WiFi
            const id = (row[0] || '--').toString().substr(-6);
            const smoke = (row[1] || '0').toString();
            const status = (row[2] || '0').toString();
            const date = (row[3] || '--').toString();
            const rawTime = row[4] || '--';
            const wifi = (row[5] || 'Unknown').toString();
            
            const time = formatTime(rawTime);
            const isSmoke = status === '1';
            const smokeNum = parseInt(smoke) || 0;
            
            const smokeColor = smokeNum > 140 ? '#CC0000' : smokeNum > 80 ? '#CC6600' : '#006600';
            const bgColor = isSmoke ? '#FFCCCC' : '#CCFFCC';
            const textColor = isSmoke ? '#990000' : '#006600';
            
            return `
                <tr style="border-bottom: 1px solid #ddd; background: #fff;">
                    <td style="padding: 10px; color: #000; font-family: monospace; font-size: 0.9em;">${id}</td>
                    <td style="padding: 10px; color: ${smokeColor}; font-weight: bold;">${smoke}</td>
                    <td style="padding: 10px;">
                        <span style="background: ${bgColor}; color: ${textColor}; padding: 4px 8px; border-radius: 4px; font-weight: bold; border: 1px solid #999;">
                            ${isSmoke ? 'SMOKE' : 'CLEAR'}
                        </span>
                    </td>
                    <td style="padding: 10px; color: #000;">${date}</td>
                    <td style="padding: 10px; color: #000; font-family: monospace; font-weight: bold;">${time}</td>
                    <td style="padding: 10px; color: #000;">${wifi}</td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('History error:', error);
    }
}

function formatTime(timeValue) {
    if (!timeValue || timeValue === '--') return '--:--:--';
    if (typeof timeValue === 'string' && /^\d{1,2}:\d{2}:\d{2}$/.test(timeValue)) {
        return timeValue;
    }
    if (typeof timeValue === 'string') {
        const match = timeValue.match(/(\d{1,2}):(\d{2}):(\d{2})/);
        if (match) return `${match[1].padStart(2, '0')}:${match[2]}:${match[3]}`;
    }
    if (typeof timeValue === 'number' || timeValue instanceof Date) {
        const d = new Date(timeValue);
        return d.toTimeString().substr(0, 8);
    }
    return timeValue.toString();
}

// Toast notifications (in-page)
function showToast(msg, type) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        border-radius: 8px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease;
    `;
    
    if (type === 'error') toast.style.background = '#CC0000';
    else if (type === 'warn') toast.style.background = '#CC6600';
    else toast.style.background = '#006600';
    
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

// Add pulse animation to style
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.8; transform: scale(1.05); }
    }
    @keyframes slideIn {
        from { transform: translateX(400px); }
        to { transform: translateX(0); }
    }
`;
document.head.appendChild(style);
