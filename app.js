const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw3YyF-hXbhDXkRosy0z45xUEvJViwqaT2-qBdSTj8JiBytKnCBl3EXoqkt3Xozm5g8/exec";
const UPDATE_INTERVAL = 3000;

let notificationPermission = false;
let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN = 600000;
let lastSmokeStatus = false;

let lastData = null;
let updateTimer = null;
commandInProgress = false;
let lastUpdateTime = 0;

const TIME_RANGES = {
    '5m': { 
        label: 'Last 5 Minutes', 
        intervalMs: 5000,
        maxPoints: 60,
        liveOnly: true
    },
    '1h': { 
        label: 'Last 1 Hour', 
        intervalMs: 60000,
        maxPoints: 60,
        historyHours: 1
    },
    '1d': { 
        label: 'Last 24 Hours', 
        intervalMs: 300000,
        maxPoints: 288,
        historyHours: 24
    },
    '1w': { 
        label: 'Last 1 Week', 
        intervalMs: 3600000,
        maxPoints: 168,
        historyHours: 168
    },
    'all': { 
        label: 'All Time', 
        intervalMs: 86400000,
        maxPoints: 365,
        historyHours: 8760
    }
};

let currentRange = '1h';
let historicalData = [];
let liveDataBuffer = [];
let smokeChart = null;
let isHistoryLoaded = false;
let isAutoScroll = true; 


document.addEventListener('DOMContentLoaded', async function() {
    console.log('Dashboard starting...');
    
    initNotifications();
    await initSmokeChart();  
    initTimeRangeControls();
    initPanControls();      
    
    await loadHistoricalData();
    isHistoryLoaded = true;
    updateAggregatedGraph();
    
    startDataUpdates();
    
    document.getElementById('muteBtn')?.addEventListener('click', () => sendCommand(0));
    document.getElementById('enableBtn')?.addEventListener('click', () => sendCommand(1));
});



async function loadHistoricalData() {
    try {
        console.log('Loading historical data...');
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=history&limit=5000&_=${Date.now()}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const rows = await response.json();
        
        if (!Array.isArray(rows) || rows.length === 0) {
            historicalData = [];
            return;
        }
        
        historicalData = rows.map(row => {
            const id = row[0];
            const smoke = parseInt(row[1]) || 0;
            const status = row[2];
            const dateStr = row[3];
            const timeStr = row[4];
            const timestamp = parseDateTime(dateStr, timeStr);
            
            return { timestamp, value: smoke, status, id };
        }).filter(item => !isNaN(item.timestamp) && item.timestamp > 0)
          .sort((a, b) => a.timestamp - b.timestamp);
        
        console.log(`Loaded ${historicalData.length} historical records`);
        
    } catch (error) {
        console.error('Failed to load historical data:', error);
        historicalData = [];
    }
}

function parseDateTime(dateStr, timeStr) {
    try {
        const dateParts = dateStr.split('-');
        if (dateParts.length !== 3) return null;
        
        const day = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]) - 1;
        const year = parseInt(dateParts[2]);
        
        const timeParts = timeStr.split(':');
        const hours = parseInt(timeParts[0]) || 0;
        const minutes = parseInt(timeParts[1]) || 0;
        const seconds = parseInt(timeParts[2]) || 0;
        
        return new Date(year, month, day, hours, minutes, seconds).getTime();
    } catch (e) {
        return null;
    }
}



function addLiveDataPoint(timestamp, value) {
    liveDataBuffer.push({ timestamp, value: Number(value) });
    
    // Keep 2 hours max
    const cutoff = Date.now() - (2 * 60 * 60 * 1000);
    const cutoffIndex = liveDataBuffer.findIndex(p => p.timestamp >= cutoff);
    if (cutoffIndex > 0) {
        liveDataBuffer = liveDataBuffer.slice(cutoffIndex);
    }
}



function getAllDataForRange(rangeKey) {
    const config = TIME_RANGES[rangeKey];
    const now = Date.now();
    const rangeStart = now - (config.maxPoints * config.intervalMs);
    
    let combinedData = [];
    
    if (config.liveOnly) {
        combinedData = liveDataBuffer.filter(p => p.timestamp >= rangeStart);
    } else {
        const relevantHistory = historicalData.filter(p => 
            p.timestamp >= rangeStart && p.timestamp < now
        );
        combinedData = [...relevantHistory, ...liveDataBuffer];
    }
    
    return combinedData.sort((a, b) => a.timestamp - b.timestamp);
}

function aggregateData(rangeKey) {
    const config = TIME_RANGES[rangeKey];
    const data = getAllDataForRange(rangeKey);
    
    if (data.length === 0) return generateEmptyTimeline(rangeKey);
    
    const now = Date.now();
    const intervalMs = config.intervalMs;
    const buckets = new Map();
    
    data.forEach(point => {
        const bucketTime = Math.floor(point.timestamp / intervalMs) * intervalMs;
        
        if (!buckets.has(bucketTime)) {
            buckets.set(bucketTime, { sum: 0, count: 0, timestamp: bucketTime });
        }
        const bucket = buckets.get(bucketTime);
        bucket.sum += point.value;
        bucket.count++;
    });
    
    const result = [];
    const endBucket = Math.floor(now / intervalMs) * intervalMs;
    const startBucket = endBucket - ((config.maxPoints - 1) * intervalMs);
    
    for (let t = startBucket; t <= endBucket; t += intervalMs) {
        const bucket = buckets.get(t);
        const avgValue = bucket ? Math.round(bucket.sum / bucket.count) : null;
        
        result.push({
            label: formatTimeLabel(t, rangeKey),
            value: avgValue,
            timestamp: t,
            hasData: bucket !== undefined
        });
    }
    
    return interpolateGaps(result);
}

function generateEmptyTimeline(rangeKey) {
    const config = TIME_RANGES[rangeKey];
    const now = Date.now();
    const intervalMs = config.intervalMs;
    
    const result = [];
    const endBucket = Math.floor(now / intervalMs) * intervalMs;
    const startBucket = endBucket - ((config.maxPoints - 1) * intervalMs);
    
    for (let t = startBucket; t <= endBucket; t += intervalMs) {
        result.push({
            label: formatTimeLabel(t, rangeKey),
            value: 0,
            timestamp: t,
            hasData: false
        });
    }
    return result;
}

function interpolateGaps(dataPoints) {
    let lastKnownValue = null;
    
    for (let i = 0; i < dataPoints.length; i++) {
        if (dataPoints[i].value !== null) {
            lastKnownValue = dataPoints[i].value;
        } else if (lastKnownValue !== null) {
            dataPoints[i].value = lastKnownValue;
        }
    }
    
    let nextKnownValue = null;
    for (let i = dataPoints.length - 1; i >= 0; i--) {
        if (dataPoints[i].hasData) {
            nextKnownValue = dataPoints[i].value;
        } else if (nextKnownValue !== null && dataPoints[i].value === null) {
            dataPoints[i].value = nextKnownValue;
        }
    }
    
    dataPoints.forEach(p => { if (p.value === null) p.value = 0; });
    return dataPoints;
}

function formatTimeLabel(timestamp, rangeKey) {
    const date = new Date(timestamp);
    switch(rangeKey) {
        case '5m': return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        case '1h': return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
        case '1d': return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
        case '1w': return date.toLocaleString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
        case 'all': return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        default: return date.toLocaleTimeString();
    }
}



async function initSmokeChart() {
    const ctx = document.getElementById('smokeChart');
    if (!ctx) return;
    
   
    await loadChartZoomPlugin();
    
    smokeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Smoke Level (Avg)',
                data: [],
                borderColor: '#FFD54F',
                backgroundColor: 'rgba(255, 213, 79, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHitRadius: 20,
                spanGaps: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleFont: { size: 12 },
                    bodyFont: { size: 14, weight: 'bold' },
                    callbacks: {
                        label: function(context) {
                            return `Avg Smoke: ${context.parsed.y}`;
                        }
                    }
                },
               
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        modifierKey: null, // No key required, just drag
                        onPan: () => { isAutoScroll = false; updatePanButtons(); }
                    },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x',
                        onZoom: () => { isAutoScroll = false; updatePanButtons(); }
                    },
                    limits: {
                        x: { min: 'original', max: 'original' },
                        y: { min: 0, max: 500 }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    suggestedMax: 400,
                    grid: { color: 'rgba(255,255,255,0.1)', drawBorder: false },
                    ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { 
                        color: 'rgba(255,255,255,0.7)', 
                        font: { size: 10 },
                        maxRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 10
                    }
                }
            }
        }
    });
}

function loadChartZoomPlugin() {
    return new Promise((resolve, reject) => {
        if (window.ChartZoom) return resolve();
        
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function updateAggregatedGraph() {
    if (!smokeChart || !isHistoryLoaded) return;
    
    const aggregated = aggregateData(currentRange);
    const labels = aggregated.map(p => p.label);
    const values = aggregated.map(p => p.value);
    
    
    if (JSON.stringify(smokeChart.data.labels) === JSON.stringify(labels) &&
        JSON.stringify(smokeChart.data.datasets[0].data) === JSON.stringify(values)) {
        return;
    }
    
    smokeChart.data.labels = labels;
    smokeChart.data.datasets[0].data = values;
    
    if (isAutoScroll && smokeChart.options.plugins.zoom) {
       
        smokeChart.resetZoom();
    }
    
    smokeChart.update('none');
}



function initPanControls() {
    const chartCard = document.getElementById('smokeChart')?.closest('.card');
    if (!chartCard) return;
    
    
    const controlBar = document.createElement('div');
    controlBar.id = 'panControlBar';
    controlBar.style.cssText = `
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 10px;
        margin-top: 10px;
        padding: 8px;
        background: rgba(0,0,0,0.2);
        border-radius: 8px;
    `;
    
    controlBar.innerHTML = `
        <button onclick="panChart('left')" id="panLeftBtn" style="
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.3);
            color: #fff;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        ">◀ Older</button>
        
        <button onclick="resetChartView()" id="resetViewBtn" style="
            background: ${isAutoScroll ? 'rgba(255, 213, 79, 0.3)' : 'rgba(255,255,255,0.1)'};
            border: 1px solid ${isAutoScroll ? '#FFD54F' : 'rgba(255,255,255,0.3)'};
            color: ${isAutoScroll ? '#FFD54F' : '#fff'};
            padding: 6px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: ${isAutoScroll ? 'bold' : 'normal'};
        ">${isAutoScroll ? '⏸ Live' : '▶ Live'}</button>
        
        <button onclick="panChart('right')" id="panRightBtn" style="
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.3);
            color: #fff;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        ">Newer ▶</button>
    `;
    
    const container = chartCard.querySelector('.chart-container');
    if (container) {
        container.after(controlBar);
    }
}

function updatePanButtons() {
    const btn = document.getElementById('resetViewBtn');
    if (btn) {
        btn.style.background = isAutoScroll ? 'rgba(255, 213, 79, 0.3)' : 'rgba(255,255,255,0.1)';
        btn.style.borderColor = isAutoScroll ? '#FFD54F' : 'rgba(255,255,255,0.3)';
        btn.style.color = isAutoScroll ? '#FFD54F' : '#fff';
        btn.style.fontWeight = isAutoScroll ? 'bold' : 'normal';
        btn.textContent = isAutoScroll ? '⏸ Live' : '▶ Live';
    }
}

window.panChart = function(direction) {
    if (!smokeChart) return;
    
    isAutoScroll = false;
    updatePanButtons();
    
    const chart = smokeChart;
    const xScale = chart.scales.x;
    const range = xScale.max - xScale.min;
    const panAmount = range * 0.2;
    
    if (direction === 'left') {
        
        chart.zoomScale('x', { min: xScale.min - panAmount, max: xScale.max - panAmount }, 'default');
    } else {
        
        chart.zoomScale('x', { min: xScale.min + panAmount, max: xScale.max + panAmount }, 'default');
    }
};

window.resetChartView = function() {
    if (!smokeChart) return;
    isAutoScroll = true;
    smokeChart.resetZoom();
    updatePanButtons();
};



function initTimeRangeControls() {
    const chartCard = document.getElementById('smokeChart')?.closest('.card');
    if (!chartCard) return;
    
    let controls = document.getElementById('timeRangeControls');
    if (!controls) {
        controls = document.createElement('div');
        controls.id = 'timeRangeControls';
        controls.style.cssText = `
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
            flex-wrap: wrap;
            justify-content: center;
        `;
        
        const title = chartCard.querySelector('h2');
        if (title) title.after(controls);
    }
    
    renderRangeButtons();
}

function renderRangeButtons() {
    const controls = document.getElementById('timeRangeControls');
    if (!controls) return;
    
    controls.innerHTML = Object.entries(TIME_RANGES).map(([key, config]) => `
        <button 
            onclick="window.setTimeRange('${key}')"
            id="range-${key}"
            style="
                padding: 6px 16px;
                border: 1px solid ${key === currentRange ? '#FFD54F' : 'rgba(255,255,255,0.3)'};
                background: ${key === currentRange ? 'rgba(255, 213, 79, 0.2)' : 'transparent'};
                color: ${key === currentRange ? '#FFD54F' : '#fff'};
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: ${key === currentRange ? 'bold' : 'normal'};
                transition: all 0.2s;
            "
        >
            ${config.label}
        </button>
    `).join('');
}

window.setTimeRange = function(rangeKey) {
    if (!TIME_RANGES[rangeKey] || rangeKey === currentRange) return;
    
    currentRange = rangeKey;
    renderRangeButtons();
    
   
    isAutoScroll = true;
    if (smokeChart) smokeChart.resetZoom();
    updatePanButtons();
    
    updateAggregatedGraph();
    console.log(`Switched to ${TIME_RANGES[rangeKey].label}`);
};



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
        
        const currentSmoke = data.status === "1" || data.status === 1;
        if (currentSmoke && !previousSmoke && !lastSmokeStatus) {
            sendSmokeNotification(data.smoke, data.device);
        }
        lastSmokeStatus = currentSmoke;
        
        updateUI(data);
        addLiveDataPoint(Date.now(), data.smoke);
        updateAggregatedGraph();

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
    
    const devStatusEl = document.getElementById('deviceStatus');
    if (devStatusEl) {
        devStatusEl.innerHTML = isOnline ? '🟢 Device Active' : '⚪ Device Offline';
        devStatusEl.style.cssText = isOnline ? 'color: #000; font-weight: bold;' : 'color: #666;';
    }
    
    const lastUpdEl = document.getElementById('lastUpdated');
    if (lastUpdEl) {
        lastUpdEl.textContent = isOnline ? `Live: ${data.time}` : `Last seen: ${data.time}`;
        lastUpdEl.style.color = '#000';
    }
    
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



function initNotifications() {
    if (!("Notification" in window)) {
        updateNotificationStatus("unsupported");
        return;
    }
    
    if (Notification.permission === "granted") {
        notificationPermission = true;
        updateNotificationStatus("enabled");
    } else if (Notification.permission !== "denied") {
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
    
    const styles = {
        enabled: "color: #006600; background: #90EE90; padding: 5px 10px; border-radius: 5px; font-size: 0.8em;",
        disabled: "color: #666; background: #eee; padding: 5px 10px; border-radius: 5px; font-size: 0.8em;",
        blocked: "color: #666; background: #eee; padding: 5px 10px; border-radius: 5px; font-size: 0.8em;",
        unsupported: "color: #999; background: #f5f5f5; padding: 5px 10px; border-radius: 5px; font-size: 0.8em;"
    };
    
    const labels = {
        enabled: "🔔 Notifications On",
        disabled: "🔕 Notifications Off",
        blocked: "🔕 Notifications Off",
        unsupported: "⚠️ Notifications Unsupported"
    };
    
    indicator.innerHTML = labels[status];
    indicator.style.cssText = styles[status];
}

function sendSmokeNotification(smokeValue, deviceName) {
    if (!notificationPermission) return;
    
    const now = Date.now();
    if (now - lastNotificationTime < NOTIFICATION_COOLDOWN) {
        console.log("Notification skipped (cooldown)");
        return;
    }
    
    const notification = new Notification("🚨 SMOKE DETECTED!", {
        body: `Smoke level: ${smokeValue} at ${deviceName || 'GMU HOD Cabin'}\nClick to view dashboard`,
        icon: "https://cdn-icons-png.flaticon.com/512/2933/2933245.png ",
        badge: "https://cdn-icons-png.flaticon.com/512/2933/2933245.png ",
        tag: "smoke-alert",
        requireInteraction: true,
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

async function loadHistory() {
    try {
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=history&_=${Date.now()}`);
        const data = await response.json();
        const last20 = data.slice(0, 20);
        const cleanedData = deduplicateEvents(last20);
        const tbody = document.querySelector('#historyTable tbody');
        
        if (!tbody) return;
        
        if (!Array.isArray(cleanedData) || cleanedData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color: #000;">No events recorded</td></tr>`;
            return;
        }
        
        tbody.innerHTML = cleanedData.map(row => {
            const id = (row[0] || '--').toString().slice(-6);
            const smoke = (row[1] || '0').toString();
            const status = (row[2] || '0').toString();
            const date = formatDate(row[3]);
            const time = formatTime(row[4]);
            const wifi = (row[5] || 'Unknown').toString();
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

function deduplicateEvents(rows) {
    const result = [];
    let lastKey = null;
    for (const row of rows) {
        const status = row[2];
        const date = row[3];
        const key = `${status}_${date}`;
        if (key === lastKey) continue;
        result.push(row);
        lastKey = key;
    }
    return result;
}

function formatDate(dateValue) {
    if (!dateValue) return '--';
    if (typeof dateValue === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(dateValue)) return dateValue;
    try {
        const d = new Date(dateValue);
        if (isNaN(d.getTime())) return '--';
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    } catch (e) {
        return '--';
    }
}

function formatTime(timeValue) {
    if (!timeValue || timeValue === '--') return '--:--:--';
    if (typeof timeValue === 'string' && /^\d{1,2}:\d{2}:\d{2}$/.test(timeValue)) return timeValue;
    if (typeof timeValue === 'string') {
        const match = timeValue.match(/(\d{1,2}):(\d{2}):(\d{2})/);
        if (match) return `${match[1].padStart(2, '0')}:${match[2]}:${match[3]}`;
    }
    if (typeof timeValue === 'number' || timeValue instanceof Date) {
        return new Date(timeValue).toTimeString().substr(0, 8);
    }
    return timeValue.toString();
}


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
    #range-5m:hover, #range-1h:hover, #range-1d:hover, #range-1w:hover, #range-all:hover {
        background: rgba(255, 213, 79, 0.1) !important;
    }
    #panLeftBtn:hover, #panRightBtn:hover {
        background: rgba(255,255,255,0.2) !important;
    }
`;
document.head.appendChild(style);

