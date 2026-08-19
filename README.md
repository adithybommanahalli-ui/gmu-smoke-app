# GMU Smoke Monitoring System

<p align="center">
  <strong>IoT-based real-time smoke monitoring and alert dashboard for GM University.</strong>
</p>

<p align="center">
  <a href="https://adithybommanahalli-ui.github.io/gmu-smoke-app/">Live Dashboard</a>
  ·
  <a href="https://github.com/adithybommanahalli-ui/gmu-smoke-app">Repository</a>
</p>

## Overview

The **GMU Smoke Monitoring System** is an IoT-based monitoring dashboard developed as a Project Based Learning (PBL) project under the Department of Computer Science & Engineering at **GM University, Davanagere**.

The system is designed to monitor smoke levels remotely, visualize historical readings, provide real-time status information, and allow authorized users to control the warning buzzer.

The web application is implemented as a lightweight, responsive **Progressive Web App (PWA)** using HTML, CSS, and JavaScript. It communicates with a Google Apps Script endpoint that acts as the bridge between the dashboard and the stored sensor data / device commands.

## What the System Does

```text
Smoke / Gas Sensor
       │
       ▼
 IoT Controller
       │
       ▼
Cloud / Data Gateway
       │
       ▼
Google Apps Script
       │
       ├──────────────► Sensor readings
       │
       └──────────────► Buzzer commands
       │
       ▼
GMU Web Dashboard
       │
       ├── Live smoke value
       ├── Intensity indicator
       ├── Historical chart
       ├── Recent events
       ├── Wi-Fi status
       └── Buzzer control
```

## Features

- **Real-time smoke monitoring** with periodic data refresh.
- **Smoke intensity meter** for quickly understanding current conditions.
- **Live status indicator** for system availability.
- **Historical data visualization** using Chart.js.
- Time-range views for **5 minutes, 1 hour, 1 day, 1 week, and all-time data**.
- Chart **zoom and pan** controls for exploring historical measurements.
- **Recent events table** with smoke level, status, date, time, and Wi-Fi information.
- **Buzzer mute / reset controls** from the dashboard.
- **Browser notifications** for smoke-related events, subject to notification permission.
- **Login screen** before accessing the monitoring dashboard.
- **Progressive Web App support** through a web manifest and service worker.
- Responsive dashboard designed for desktop and mobile screens.
- GM University branding and project information integrated into the interface.

## Dashboard

The dashboard provides three primary monitoring areas:

### 1. Current Smoke Level

The current sensor value is displayed prominently together with a visual meter and intensity label.

### 2. Historical Monitoring

Sensor history is fetched from the configured Google Apps Script endpoint and plotted using **Chart.js**. The frontend supports different time ranges and aggregates readings into configurable time buckets.

### 3. Buzzer Control

Authorized users can send control commands to mute or re-enable the warning buzzer.

## Data Flow

The frontend polls the configured data endpoint every **3 seconds** for current updates. Historical records can also be loaded in bulk and combined with the live data buffer for graph rendering.

The current frontend configuration uses a Google Apps Script web-app endpoint:

```javascript
const GOOGLE_SCRIPT_URL = "<your-google-apps-script-endpoint>";
```

For a production deployment, replace the project endpoint with your own deployed Google Apps Script URL and avoid committing private infrastructure details unnecessarily.

## Technology Stack

### Frontend

- HTML5
- CSS3
- Vanilla JavaScript
- Chart.js
- Chart.js Zoom Plugin

### Web Platform

- Progressive Web App (PWA)
- Web App Manifest
- Service Worker
- Browser Local Storage for the current login flow

### Cloud / Data Layer

- Google Apps Script
- Google Sheets or another Apps Script-backed data source
- IoT device command/data endpoint

## Project Structure

```text
GMU Smoke Monitoring System/
│
├── index.html                  # Main monitoring dashboard
├── login.html                  # Login page
├── login.js                    # Client-side login logic
├── app.js                      # Dashboard logic, data fetching, charting, alerts
├── style.css                   # Dashboard styling and responsive layout
├── manifest.json               # PWA manifest
├── service-worker.js            # Service worker for PWA behavior/caching
│
├── assets/
│   ├── college.png             # GMU / project imagery
│   ├── gmu-logo.svg             # GMU logo
│   ├── cursor1.png             # UI asset
│   └── Comp 2_00000.png         # Project / branding asset
│
└── fonts/
    └── TACTICSANSEXD-BLDIT.OTF  # Project display font
```

The current repository is intentionally lightweight and does not require a frontend build system such as React, Vite, or Node.js.

## Getting Started

### Run Locally

Because this is a client-side web application, you can run it with any static web server.

For example, with Python:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/login.html
```

Using a local HTTP server is preferable to opening the files directly with `file://`, especially when testing service-worker or browser API behavior.

### Login

The current frontend demo login is implemented entirely in JavaScript:

```text
Username: admin
Password: admin
```

The credentials are stored in client-side source code and are **not suitable for production security**. For a real deployment, authentication should be moved to a server-side system with secure credential storage and session management.

## Configuration

The dashboard's main data source is configured in `app.js`:

```javascript
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";
```

The Google Apps Script endpoint is expected to support operations used by the frontend, including historical data retrieval and device commands.

### Data Refresh

The live update interval is currently configured as:

```javascript
const UPDATE_INTERVAL = 3000;
```

That means the dashboard attempts to refresh current monitoring data every **3 seconds**.

## Historical Data Ranges

The dashboard supports the following views:

| Range | Sampling / Aggregation | Maximum Points |
|---|---:|---:|
| 5 minutes | 5 seconds | 60 |
| 1 hour | 1 minute | 60 |
| 1 day | 5 minutes | 288 |
| 1 week | 1 hour | 168 |
| All time | 1 day | 365 |

Historical readings are combined with recent live data and aggregated into time buckets before being rendered on the chart.

## Notifications

The application includes browser notification support for smoke events. Users must grant notification permission in the browser before notifications can be displayed.

A cooldown mechanism is used so the same alert is not repeatedly surfaced every few seconds during a continuous smoke event.

## Progressive Web App

The project includes:

- `manifest.json`
- `service-worker.js`
- app icons and branded assets

The manifest configures the application as a standalone web app suitable for installation on supported devices.

## Deployment

The repository can be deployed as a static website using services such as:

- GitHub Pages
- Vercel
- Netlify
- Cloudflare Pages
- Any standard static hosting provider

The project has previously been configured for GitHub Pages-style hosting.

When deploying, make sure the hosted frontend can reach the configured Google Apps Script endpoint and that browser security policies permit the required requests.

## Architecture Notes

This repository contains the **monitoring dashboard layer**. The actual smoke sensor hardware and device firmware are external to the frontend repository.

A complete deployment therefore consists of:

```text
[Smoke Sensor]
      ↓
[IoT Controller / NodeMCU]
      ↓
[Network / IoT Cloud or Gateway]
      ↓
[Google Apps Script / Data Layer]
      ↓
[GMU Smoke Monitoring Dashboard]
```

This separation keeps the dashboard lightweight while allowing the IoT layer to evolve independently.

## Safety and Security Considerations

This project is intended as an academic / prototype monitoring system and should **not be treated as a certified fire-safety system** without proper hardware validation, redundancy, testing, and regulatory compliance.

Important production improvements include:

- Replace client-side authentication with secure server-side authentication.
- Protect device command endpoints from unauthorized access.
- Move private API endpoints and credentials out of public JavaScript.
- Use HTTPS for all production communications.
- Add sensor fault detection and offline-device alerts.
- Add server-side validation of incoming sensor readings.
- Add stronger alert delivery mechanisms such as SMS, email, or push notifications.
- Log and audit buzzer-control actions.

## Future Scope

Potential improvements include:

- Mobile push notifications.
- Email and SMS emergency alerts.
- Multiple sensor nodes across different rooms/buildings.
- Real-time anomaly detection instead of simple threshold-based alerts.
- Device health and connectivity monitoring.
- Role-based access for administrators and staff.
- Automated incident history and reporting.
- IoT cloud integration with richer telemetry and analytics.
- Offline-first synchronization for unstable network environments.
- More robust authentication and device authorization.

## Academic Context

**Project:** Real-Time Smoke Monitoring with Remote Alerts

**Type:** Project Based Learning (PBL) — Internet of Things

**Institution:** GM University, Davanagere

**Department:** Computer Science & Engineering

The project demonstrates how IoT sensing, cloud-connected data handling, web visualization, and remote device control can be combined into a practical monitoring system.

## Author / Contributors

### Project Team

- Abhishek U S
- Aditya B
- Aman M K
- Chandankumar K

### Project Leadership

- **HOD CSE:** Dr. Shivanagowda G M
- **Project Coordinator:** Ms. Nanditha G

## License

No explicit open-source license is currently defined in the repository. Until a license is added, the source code remains under the default copyright terms of its author/contributors.

## Repository

[GitHub — gmu-smoke-app](https://github.com/adithybommanahalli-ui/gmu-smoke-app)
