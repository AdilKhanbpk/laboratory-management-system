# Offline Laboratory Management System (LMS)

A professional, air-gapped, offline-first Laboratory Management System engineered for medical diagnostic clinics and pathology laboratories.

## Key Architecture & Features

- **100% Offline & Air-Gapped**: Runs completely on-premises without requiring internet connectivity.
- **SQLite with SQLCipher / DPAPI Encryption**: Database files are encrypted at rest with AES-256 and protected using Windows Data Protection API (DPAPI) and master key recovery.
- **LQMS & WHO Guideline Catalog**: Compliant with WHO Laboratory Quality Management System standards, supporting multiple parameters, clinical reference ranges by age/gender, and turnaround times.
- **Fast Billing & Visit Accession**: Instant patient registration (Name, Sex, Age) with automatic invoice generation and doctor referral tracking.
- **Results Entry & Dual Authorization**: Result entry with panic/critical limits, validation flags, digital report generation, and immutable audit logs.
- **Hardened Database Backup & Recovery**:
  - Automatically remembers default backup folder (e.g. `D:\Backups`).
  - Standardized timestamps: `lms_backup_MMM-DD-YYYY&Time-H-MM-ampm.db`.
  - Atomic older-file cleanup option.
  - Dedicated Developer Portal protected with master password (`aaaaaaaa`).
  - 100-digit dynamic hourly authorization keys.

## Tech Stack

- **Electron** (v45)
- **React 19** + **TypeScript**
- **Vite** + **Tailwind CSS**
- **better-sqlite3-multiple-ciphers**
- **Vitest** for unit & integration testing

## Getting Started

### Prerequisites

- Node.js >= 18
- Windows OS (x64)

### Development

```bash
# Install dependencies
npm install

# Run Vite dev server and Electron app
npm run dev
```

### Testing

```bash
# Run complete test suite (all 23 test suites / 94+ tests)
npm test
```

### Production Build & Installer

```bash
# Build frontend and electron binaries
npm run build

# Generate standalone Windows installer (.exe)
npm run dist:win
```
The installer will be generated in `dist-installer/Offline Laboratory Management System Setup 1.0.0.exe`.

## License

Proprietary - Laboratory Management System.
