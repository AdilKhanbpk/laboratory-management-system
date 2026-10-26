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













To test and see your changes, you have 2 simple options:

Option 1: Fast Way (Takes 3 seconds — To test immediately on your screen)

Whenever you edit files in src/ or electron/, open your terminal in D:\LMS and run:

powershell
npm run build; npm start

What this does:

npm run build: Compiles your React UI and Electron code.
npm start: Instantly launches the desktop application window so you can see and test your changes immediately.
Option 2: Full Installer Way (Takes ~30 seconds — When you want a new .exe file)

When you are done testing and want to generate the updated setup file to install or share with someone:

powershell
npm run dist:win

What this does:

It compiles all changes and updates the setup file located at:
📁 D:\LMS\dist-installer\Offline Laboratory Management System Setup 1.0.0.exe
Summary:
To test right now while coding: 👉 npm run build; npm start
To make the final .exe installer: 👉 npm run dist:win

databaseFilePath=C:\Users\Smart Tech\AppData\Roaming\offline-laboratory-management-system\lms_secure.db
ShareableEXEfile= D:\LMS\dist-installer\Offline Laboratory Management System Setup 1.0.0.exe


Sometime While sharing the application through browser or USB , the Exe file get currupted or blocked by antivirus software.
To avoid this, you can compress the .exe file into a .zip file before sharing. This will help prevent any issues during the 
transfer and ensure that the recipient can run the application without problems.



Option 1: Use the Portable ZIP (Recommended — No Installation Required)
I have created a standalone portable package that bypasses the installer completely:
File: Offline-Laboratory-Management-System-Portable.zip
(Path: D:\LMS\dist-installer\Offline-Laboratory-Management-System-Portable.zip)
How to use on the other PC:
Copy or download this .zip to the other computer.
Right-click the .zip and select Extract All (e.g., extract to C:\LMS or Desktop).
Open the folder and double-click Offline Laboratory Management System.exe.
The application opens immediately — no installation needed.


Option 2: Share the Zipped Setup Installer
When an installer is packaged inside a .zip archive, web browsers and cloud storage services treat it as safe binary data and will never corrupt or truncate it:
File: Offline-Laboratory-Management-System-Setup-1.0.0.zip
(Path: D:\LMS\dist-installer\Offline-Laboratory-Management-System-Setup-1.0.0.zip)
How to use on the other PC:
Share/download the .zip file onto the other system.
Extract the .zip.
Run the extracted Offline Laboratory Management System Setup 1.0.0.exe. It will install cleanly without error.


Option 3: Run with the /NCRC flag (If using the file already on that PC)
If you already have the .exe file on the other computer and want to bypass the integrity check:
On that computer, press Win + R, type cmd, and press Enter.
Drag and drop the .exe file into the black Command Prompt window.
Type a space followed by /NCRC:
cmd
"Offline Laboratory Management System Setup 1.0.0.exe" /NCRC
Press Enter. The installer will launch and install without checking the CRC.


