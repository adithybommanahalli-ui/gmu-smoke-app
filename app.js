

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw3YyF-hXbhDXkRosy0z45xUEvJViwqaT2-qBdSTj8JiBytKnCBl3EXoqkt3Xozm5g8/exec";
const UPDATE_INTERVAL = 3000;

let lastData = null;
let updateTimer = null;
let commandInProgress = false;
let lastUpdateTime = 0;

document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard starting...');
    startDataUpdates();
    loadHistory();
    
    document.getElementById('muteBtn')?.addEventListener('click', () => sendCommand(0));
    document.getElementById('enableBtn')?.addEventListener('click', () => sendCommand(1));
});

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
        lastData = data;
        lastUpdateTime = Date.now();
        
        updateUI(data);
    } catch (error) {
        console.error('Update error:', error);
        if (lastData) {
            lastData.online = false;
            updateUI(lastData);
        }
    }
}

function updateUI(data) {
    const isOnline = data.online === true && parseInt(data.seconds_since_update) < 35;
    const isSmoke = parseInt(data.status) === 1;
    const smokeVal = parseInt(data.smoke) || 0;
    const isMuted = data.buzzer_state === "0";
    const secondsSince = parseInt(data.seconds_since_update) || 999;
    
    // Status indicators - NORMAL COLORS (black/dark text)
    const sysStatusEl = document.getElementById('systemStatus');
    if (sysStatusEl) {
        if (isOnline) {
            sysStatusEl.innerHTML = '🟢 System Online';
            sysStatusEl.style.cssText = 'color: #000000; background: #90EE90; padding: 8px 16px; border-radius: 20px; font-weight: bold;';
        } else {
            const mins = Math.floor(secondsSince / 60);
            const timeStr = mins > 0 ? `${mins}m ago` : `${secondsSince}s ago`;
            sysStatusEl.innerHTML = `🔴 Offline (${timeStr})`;
            sysStatusEl.style.cssText = 'color: #000000; background: #FFB6C1; padding: 8px 16px; border-radius: 20px; font-weight: bold;';
        }
    }
    
    // Device status
    const devStatusEl = document.getElementById('deviceStatus');
    if (devStatusEl) {
        devStatusEl.innerHTML = isOnline ? '🟢 Device Active' : '⚪ Device Offline';
        devStatusEl.style.cssText = isOnline ? 'color: #000000; font-weight: bold;' : 'color: #666666;';
    }
    
    // Last update text
    const lastUpdEl = document.getElementById('lastUpdated');
    if (lastUpdEl) {
        lastUpdEl.textContent = isOnline ? `Live: ${data.time}` : `Last seen: ${data.time}`;
        lastUpdEl.style.color = '#000000';
    }
    
    // Smoke value - NORMAL DARK COLORS
    const smokeEl = document.getElementById('smokeValue');
    if (smokeEl) {
        if (!isOnline) {
            smokeEl.textContent = "N/A";
            smokeEl.style.cssText = 'color: #000000; font-size: 4em; font-weight: bold;';
        } else {
            smokeEl.textContent = smokeVal;
            // Use dark colors, not neon
            if (isSmoke || smokeVal > 140) {
                smokeEl.style.cssText = 'color: #CC0000; font-size: 4em; font-weight: bold;'; // Dark red
            } else if (smokeVal > 80) {
                smokeEl.style.cssText = 'color: #CC6600; font-size: 4em; font-weight: bold;'; // Dark orange
            } else {
                smokeEl.style.cssText = 'color: #006600; font-size: 4em; font-weight: bold;'; // Dark green
            }
        }
    }
    
    // Progress meter
    const meterEl = document.getElementById('smokeMeter');
    const meterText = document.getElementById('meterText');
    if (meterEl && meterText) {
        if (!isOnline) {
            meterEl.style.width = '0%';
            meterEl.style.background = '#cccccc';
            meterText.textContent = 'OFFLINE';
            meterText.style.color = '#000000';
        } else {
            const pct = Math.min((smokeVal / 1023) * 100, 100);
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
            meterText.style.color = '#FFFFFF'; // White text on colored bar
        }
    }
    
    // Info fields - ALL BLACK TEXT
    const fields = ['smokeStatus', 'deviceId', 'wifiName', 'rssiValue', 'lastEvent'];
    const values = [
        isOnline ? data.status_text : '--',
        data.device || 'Unknown',
        data.wifi || 'Unknown',
        data.rssi ? `${data.rssi} dBm` : '--',
        data.reason || '--'
    ];
    
    fields.forEach((id, index) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = values[index];
            el.style.color = '#000000';
            el.style.fontWeight = 'normal';
        }
    });
    
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
    
    // NORMAL BUTTON COLORS (not bright neon)
    if (muted) {
        muteBtn.textContent = '🔕 MUTED';
        muteBtn.style.cssText = 'background: #794141; color: #FFFFFF; padding: 15px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;';
        enableBtn.textContent = '🔔 ENABLE BUZZER';
        enableBtn.style.cssText = 'background: #006600; color: #FFFFFF; padding: 15px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;';
    } else {
        muteBtn.textContent = '🔕 MUTE BUZZER';
        muteBtn.style.cssText = 'background: #CC0000; color: #FFFFFF; padding: 15px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;';
        enableBtn.textContent = '🔔 ENABLED';
        enableBtn.style.cssText = 'background: #666666; color: #FFFFFF; padding: 15px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;';
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

// FIXED HISTORY - Only 6 columns, proper time format, normal colors
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
            // ONLY TAKE FIRST 6 COLUMNS: ID, Smoke, Status, Date, Time, WiFi
            // Ignore Device (index 6) and Reason (index 7) columns
            const id = (row[0] || '--').toString().substr(-6);
            const smoke = (row[1] || '0').toString();
            const status = (row[2] || '0').toString();
            const date = (row[3] || '--').toString();
            const rawTime = row[4] || '--';
            const wifi = (row[5] || 'Unknown').toString();
            
            // FIX TIME FORMAT: Extract HH:mm:ss from ugly date string
            const time = formatTime(rawTime);
            
            const isSmoke = status === '1';
            const smokeNum = parseInt(smoke) || 0;
            
            // NORMAL COLORS (dark, readable)
            const smokeColor = smokeNum > 140 ? '#CC0000' : smokeNum > 80 ? '#CC6600' : '#006600';
            const bgColor = isSmoke ? '#FFCCCC' : '#CCFFCC';
            const textColor = isSmoke ? '#990000' : '#006600';
            
            return `
                <tr style="border-bottom: 1px solid #ddd; background: #ffffff;">
                    <td style="padding: 10px; color: #000000; font-family: monospace; font-size: 0.9em;">${id}</td>
                    <td style="padding: 10px; color: ${smokeColor}; font-weight: bold;">${smoke}</td>
                    <td style="padding: 10px;">
                        <span style="background: ${bgColor}; color: ${textColor}; padding: 4px 8px; border-radius: 4px; font-weight: bold; border: 1px solid #999;">
                            ${isSmoke ? 'SMOKE' : 'CLEAR'}
                        </span>
                    </td>
                    <td style="padding: 10px; color: #000000;">${date}</td>
                    <td style="padding: 10px; color: #000000; font-family: monospace; font-weight: bold;">${time}</td>
                    <td style="padding: 10px; color: #000000;">${wifi}</td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('History error:', error);
    }
}

// Helper: Extract clean time from messy date string
function formatTime(timeValue) {
    if (!timeValue || timeValue === '--') return '--:--:--';
    
    // If it's already simple HH:mm:ss, return it
    if (typeof timeValue === 'string' && /^\d{1,2}:\d{2}:\d{2}$/.test(timeValue)) {
        return timeValue;
    }
    
    // If it's the ugly "Sat Dec 30 1899..." format, extract time
    if (typeof timeValue === 'string') {
        // Try to match HH:mm:ss pattern
        const match = timeValue.match(/(\d{1,2}):(\d{2}):(\d{2})/);
        if (match) {
            return `${match[1].padStart(2, '0')}:${match[2]}:${match[3]}`;
        }
    }
    
    // If it's a Date object or timestamp
    if (typeof timeValue === 'number' || timeValue instanceof Date) {
        const d = new Date(timeValue);
        return d.toTimeString().substr(0, 8);
    }
    
    return timeValue.toString();
}
