# TTAPP — Complete Setup Guide for Client Testing

This guide will help you set up and run all 3 parts of the project on your local machine:
- **Backend API** (Express.js + MySQL)
- **React Website** (ttapp-web)
- **Flutter Android App** (ttapp)

---

## 📦 Prerequisites

Install these on your machine first:

1. **MySQL** — [Download MySQL Community Server](https://dev.mysql.com/downloads/mysql/) (free)
2. **Node.js v18+** — [Download Node.js](https://nodejs.org/) (free)
3. **Flutter SDK** — [Install Flutter](https://docs.flutter.dev/get-started/install) (free, for building APK)
4. **Git** (optional) — to clone the project

---

## 🗄️ Step 1: Setup MySQL Database

### 1.1 Install & Start MySQL
- Install MySQL from the link above
- Remember the **root password** you set during installation
- Start MySQL service

### 1.2 Create the Database
Open MySQL command line or any MySQL client (like MySQL Workbench) and run:
```sql
CREATE DATABASE ttapp_db;
```

### 1.3 Import the Schema
In the `ttapp-backend` folder, there's a `schema.sql` file. Run it:
```bash
# Via command line (replace root and password with yours)
mysql -u root -p ttapp_db < schema.sql

# Or open schema.sql in MySQL Workbench and execute it
```

This creates all 14 tables with the correct structure.

---

## ⚙️ Step 2: Start the Backend API

```bash
# Navigate to backend folder
cd ttapp-backend

# Install dependencies
npm install

# Copy and edit the environment file
cp .env.example .env
```

### Edit `.env` file:
```
DATABASE_URL="mysql://root:YOUR_PASSWORD@localhost:3306/ttapp_db"
JWT_SECRET="any_random_long_string_here"
JWT_EXPIRES_IN="7d"
PORT=3000
NODE_ENV=development
```

### Start the server:
```bash
npm start
```
✅ Backend runs at: **http://localhost:3000**

To test: Open browser and go to `http://localhost:3000/api/admin/stats` — you should see JSON data.

---

## 🌐 Step 3: Run the React Website

```bash
# Navigate to website folder
cd ttapp-web

# Install dependencies
npm install

# Start development server
npm run dev
```
✅ Website runs at: **http://localhost:5173**

---

## 📱 Step 4: Build Android APK

### 4.1 Update the API URL
Open this file in the Flutter app:
```
ttapp/lib/core/constants/app_constants.dart
```

Change the `baseUrl` to point to your backend:
```dart
// For testing on emulator/Chrome:
static const String baseUrl = 'http://localhost:3000/api';

// For testing on a physical Android phone connected to same WiFi:
// Find your computer's local IP (run: ipconfig or ifconfig)
static const String baseUrl = 'http://192.168.x.x:3000/api'; // ← replace x.x with your IP
```

### 4.2 Build the APK
```bash
cd ttapp

# Get Flutter dependencies
flutter pub get

# Build release APK
flutter build apk --release
```

✅ APK file is at:
```
ttapp/build/app/outputs/flutter-apk/app-release.apk
```

Transfer this APK to any Android phone and install it.

---

## 📁 Project Structure Reference

```
Desktop/
├── ttapp/              → Flutter mobile app source code
│   └── build/app/outputs/flutter-apk/app-release.apk  → Installable Android app
│
├── ttapp-backend/      → Backend API server
│   ├── prisma/         → Database schema (Prisma)
│   ├── src/            → Express.js routes & controllers
│   ├── schema.sql      → ✅ Fresh SQL to create database tables
│   ├── .env            → Database & server configuration
│   └── SETUP_GUIDE.md  → ← This file
│
└── ttapp-web/          → React website source code
    └── dist/           → Production build (ready to deploy)
```

## 🔄 Quick Start Summary

```bash
# 1. Create database
mysql -u root -p -e "CREATE DATABASE ttapp_db;"

# 2. Import tables
mysql -u root -p ttapp_db < ttapp-backend/schema.sql

# 3. Start backend
cd ttapp-backend && npm install && npm start

# 4. Start website (new terminal)
cd ttapp-web && npm install && npm run dev

# 5. Build APK (new terminal)
cd ttapp && flutter pub get && flutter build apk --release
```

---

## ❓ Troubleshooting

| Issue | Solution |
|-------|----------|
| `Can't connect to MySQL` | Make sure MySQL is running. Check `.env` DATABASE_URL has correct password. |
| `Port 3000 already in use` | Change `PORT=3001` in `.env` and update the URL in Flutter/React configs. |
| APK can't connect to backend | The phone needs to be on the same WiFi. Use your computer's LAN IP (not localhost). |
| Website shows blank page | Check browser console for CORS errors. Ensure backend is running. |