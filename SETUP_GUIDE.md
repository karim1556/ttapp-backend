# 🕒 TT Manager — Complete Local Setup Guide

Welcome! This guide is designed to help you get the entire college timetable system up and running on your local machine, even if you don't have a background in software development.

The project is split into **three parts**:
1. **💾 Backend API** (`ttapp-backend`): The brains of the application that manages data and generates timetables.
2. **🌐 React Web Portal** (`ttapp-web`): The admin website interface.
3. **📱 Flutter Mobile App** (`ttapp`): The app interface for students/faculty/admins.

---

## 🗺️ System Architecture

```mermaid
graph TD
    Web[🌐 React Web App] -->|HTTP Requests| API[⚙️ Express.js Backend API]
    App[📱 Flutter Android App] -->|HTTP Requests| API
    API -->|Queries & Transactions| DB[(🗄️ MySQL Database)]
```

---

## 📦 Step 0: Install the Basics

Before doing anything, you need to install these programs on your computer. Download and install them using their default settings:

1. **Node.js (v18 or v20)**
   - 💻 [Download Node.js](https://nodejs.org/)
   - *Why?* This runs the server code and the website on your machine.
2. **MySQL Community Server**
   - 💻 [Download MySQL Server](https://dev.mysql.com/downloads/mysql/)
   - *Important!* During installation, you will be asked to set a **root password**. **Write this password down!** You will need it in Step 1.
3. **Flutter SDK**
   - 💻 [Download Flutter SDK](https://docs.flutter.dev/get-started/install)
   - *Why?* Needed to build the Android `.apk` install package.
4. **Git** (Optional)
   - 💻 [Download Git](https://git-scm.com/) (helpful to clone the folders).

---

## 🗄️ Step 1: Set Up the MySQL Database

We need to create a database and import the table structures.

### 1.1 Start MySQL
- Ensure your MySQL database service is running (on Windows, this is usually automatic. On macOS, you can start it from System Settings -> MySQL).

### 1.2 Create and Import the Schema
Choose **one** of the two methods below:

#### Method A: Using a GUI Client (Recommended for Beginners)
1. Install a free database viewer like **DBeaver** or **MySQL Workbench**.
2. Connect to localhost using user `root` and the **password you created in Step 0**.
3. Right-click your connection and select **Create New Database**. Name it `ttapp_db`.
4. Open the SQL editor, copy the entire contents of the [schema.sql](file:///Users/karimshaikh/Desktop/ttapp-backend/schema.sql) file, paste them in, and click **Execute/Run**.

#### Method B: Using the Terminal / Command Prompt
Open your terminal/command line and run:
```bash
# 1. Log in to MySQL and create the database (Enter your password when prompted)
mysql -u root -p -e "CREATE DATABASE ttapp_db;"

# 2. Import the tables directly from the schema.sql file
mysql -u root -p ttapp_db < schema.sql
```

---

## ⚙️ Step 2: Configure & Start the Backend API

This connects the server code to your MySQL database.

1. Open your terminal and navigate to the backend folder:
   ```bash
   cd ttapp-backend
   ```
2. Install the server dependencies:
   ```bash
   npm install
   ```
3. Set up your configuration file:
   - Duplicate/copy the file `.env.example` and rename it to `.env`.
   - Open `.env` in a text editor (like Notepad or VS Code) and update the `DATABASE_URL` line:
     ```env
     DATABASE_URL="mysql://root:YOUR_MYSQL_PASSWORD_HERE@localhost:3306/ttapp_db"
     JWT_SECRET="any_random_long_phrase_here_to_secure_tokens"
     JWT_EXPIRES_IN="7d"
     PORT=3000
     NODE_ENV=development
     ```
     *(Be sure to replace `YOUR_MYSQL_PASSWORD_HERE` with your actual MySQL root password).*

4. Start the backend server:
   ```bash
   npm start
   ```
   🚀 **Success Check:** You should see `Server is running on port 3000`. 
   Open your browser and visit: `http://localhost:3000/api/timetable/slots`. If it returns some text/JSON, the backend is working perfectly!

---

## 🌐 Step 3: Run the Website (React Web Portal)

This will launch the Web Admin Portal.

1. Open a **new terminal window** (keep the backend server running!).
2. Navigate to the web folder:
   ```bash
   cd ttapp-web
   ```
3. Install the dependencies:
   ```bash
   npm install
   ```
4. Start the local server:
   ```bash
   npm run dev
   ```
   🚀 **Success Check:** The terminal will show a link like `http://localhost:5173`. Open that link in your browser to view the administration portal login page.

---

## 📱 Step 4: Configure and Build the Android App (APK)

To test the Flutter app on an Android device or emulator:

### 4.1 Update the Backend Server URL
We must tell the app where the backend is hosted. 
1. Open this file in a text editor:
   `ttapp/lib/core/constants/app_constants.dart`
2. Update the `baseUrl` constant:
   - **If testing on a computer emulator/simulator:**
     ```dart
     static const String baseUrl = 'http://localhost:3000/api';
     ```
   - **If testing on a real Android phone (Recommended):**
     Your phone and computer must be on the **same Wi-Fi network**. Find your computer's local IP address (Windows: run `ipconfig`, Mac/Linux: run `ifconfig` or `ipconfig getifaddr en0`). 
     Replace the IP below with yours:
     ```dart
     static const String baseUrl = 'http://192.168.1.100:3000/api'; // Replace with your IP!
     ```

### 4.2 Build the installable APK
1. Open a **new terminal window**.
2. Navigate to the app folder:
   ```bash
   cd ttapp
   ```
3. Fetch dependencies:
   ```bash
   flutter pub get
   ```
4. Run the release build command:
   ```bash
   flutter build apk --release
   ```
5. Once complete, you will find your installable file here:
   📦 `ttapp/build/app/outputs/flutter-apk/app-release.apk`
   
   *Tip: Email this file to yourself or upload it to Google Drive to download and install it directly on any Android device.*

---

## 🛠️ Quick Troubleshooting Guide

| Problem | Explanation | Fix |
|:---|:---|:---|
| **Database Connection Error** | The backend cannot talk to MySQL. | Open `.env` in `ttapp-backend`. Check that your database password matches your MySQL root password and that MySQL is running. |
| **Port 3000 is already in use** | Another app is using port 3000. | Change `PORT=3001` in your `.env` file, restart the server, and update the Flutter/React API endpoints. |
| **App won't load data / loading spinner** | The phone cannot connect to your PC's backend. | 1. Ensure the phone and PC are on the *exact* same Wi-Fi connection.<br>2. Double check that you replaced the local IP in `app_constants.dart` with your PC's real IP, not `localhost`. |
| **Blank Web Portal screen** | React website cannot fetch resources. | Ensure the backend API is active and running in its own terminal window. |