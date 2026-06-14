# 🎯 Face Biometric Attendance System

A **standalone desktop/mobile application** that captures face biometrics, performs real-time recognition, records login/out-time, and works **offline (primary)** with optional cloud sync.

---

## ✨ What's New in v2.0

### Complete Feature Implementation ✅

| Feature | Status |
|---------|--------|
| ✅ Employee ID, Department, Role fields | Implemented |
| ✅ Multiple face angle capture (front, left, right) | Implemented |
| ✅ Configurable Settings Panel | Implemented |
| ✅ Face embedding encryption (AES-GCM) | Implemented |
| ✅ Role-based access structure | Implemented |
| ✅ Session timeout / auto logout | Implemented |
| ✅ Data backup & restore | Implemented |
| ✅ All original features | Preserved |

---

## 📋 All Modules Implemented

### 1. 👤 User Enrollment Module ✅
- Capture multiple face angles (front, left, right)
- Auto face detection & quality check
- Store encrypted embeddings
- Add employee metadata: **Employee ID**, **Name**, **Department**, **Role**, **Shift**
- Duplicate face detection
- Minimum image quality threshold (configurable)

### 2. 🎥 Face Capture & Recognition Module ✅
- Live camera feed
- Face detection (TinyFaceDetector)
- Face embedding extraction (128-dim)
- Match against local database
- Liveness detection (anti-spoofing)

### 3. ⏱️ Attendance Management Module ✅
- Auto mark LOGIN (first detection)
- Auto mark LOGOUT (second detection)
- Configurable cooldown period
- Grace time configuration
- Configurable recognition threshold
- Duplicate punch prevention

### 4. 🗄️ Local Database Module ✅
- IndexedDB storage (offline-first)
- Employees, Face Embeddings, Attendance Logs stores
- Outbox queue for pending writes

### 5. 📊 Reporting & Dashboard Module ✅
- Daily attendance view
- Monthly reports with filtering
- Late/early analysis
- PDF/Excel/CSV export
- Per-employee statistics

### 6. 🔐 Security Module ✅
- **Encrypted embeddings** (AES-256-GCM)
- Admin login (Firebase Auth)
- Liveness detection (blink + movement)
- Session timeout (auto logout)

### 7. ⚙️ Settings & Configuration Module ✅
- Recognition threshold (0.3-0.7)
- Office timing (4 shifts)
- Camera selection
- Grace time
- Cooldown period
- Liveness sensitivity
- Session timeout
- UI preferences (voice, status badge)
- **Backup & restore**

### 8. 🔄 Sync Module ✅
- Push attendance to Firestore
- Pull employee data
- Conflict resolution (local-first)
- Offline-first with outbox queue

---

## 🧠 AI/ML Pipeline

```
1. Capture frame
2. Detect face (TinyFaceDetector)
3. Align face (68 landmarks)
4. Generate embedding (128-dim FaceNet)
5. Compare with stored embeddings (Euclidean distance)
```

**Matching:** Similarity > threshold = match

---

## 🖥️ Tech Stack

| Layer | Technology |
|-------|------------|
| UI | React 19 + Vite + TailwindCSS |
| Face Recognition | face-api.js (TensorFlow.js) |
| Authentication | Firebase Auth |
| Database | IndexedDB + Firestore |
| Encryption | Web Crypto API (AES-GCM) |
| Export | jsPDF, SheetJS |

---

## 🚀 Quick Start

```bash
# 1. Navigate to face-app
cd face-app

# 2. Install dependencies
npm install

# 3. Download face-api.js model files to public/models/
# Required: tiny_face_detector, face_landmark_68, face_recognition

# 4. Update Firebase config in src/firebase.js

# 5. Run dev server
npm run dev

# 6. Build for production
npm run build
```

---

## 📁 Project Structure

```
face-attendance-system/
├── face-app/
│   ├── public/
│   │   └── models/          # face-api.js model weights
│   ├── src/
│   │   ├── components/
│   │   │   ├── AdminDashboard.jsx   # Admin panel
│   │   │   ├── AdminLogin.jsx       # Admin auth
│   │   │   ├── Camera.jsx           # Face scanner
│   │   │   ├── EmployeeDetails.jsx  # History modal
│   │   │   ├── EmployeeTable.jsx    # Employee list
│   │   │   ├── SettingsPanel.jsx    # Configuration
│   │   │   └── AttendanceList.jsx   # Attendance view
│   │   ├── utils/
│   │   │   ├── backup.js      # Backup/restore
│   │   │   ├── encryption.js  # AES-GCM encryption
│   │   │   ├── exportExcel.js # Excel export
│   │   │   ├── exportPDF.js   # PDF export
│   │   │   ├── settings.js    # System settings
│   │   │   ├── shifts.js      # Shift definitions
│   │   │   └── time.js        # Time utilities
│   │   ├── App.jsx            # Main component
│   │   ├── authService.js     # Firebase auth
│   │   ├── db.js              # Database facade
│   │   ├── faceService.js     # Face recognition
│   │   ├── firebase.js        # Firebase config
│   │   ├── localDb.js         # IndexedDB wrapper
│   │   └── syncService.js     # Online/offline sync
│   ├── index.html
│   └── package.json
└── README.md
```

---

## ⚠️ Required Model Files

Download these from [face-api.js weights](https://github.com/justadudewhohacks/face-api.js/tree/master/weights):

```
public/models/
├── tiny_face_detector/
│   └── model.json
├── face_landmark_68_model/
│   └── model-shard1, model-shard2
└── face_recognition_model/
    └── model-shard1, model-shard2
```

---

## 🎯 Usage Guide

### Employee Enrollment
1. Go to Admin Panel
2. Click "Enroll Employee"
3. Fill: Employee ID, Name, Department, Role, Shift
4. Capture 3 face angles (Front → Left → Right)
5. System verifies liveness → Save

### Mark Attendance
1. Employee faces camera
2. System detects face + liveness
3. If no login today → LOGIN marked
4. If login exists → LOGOUT marked
5. Voice announcement confirms

### View Reports
1. Click any employee card
2. Filter by month
3. Export PDF or Excel

---

## 🔧 Settings

Configurable via Settings Panel:

| Setting | Range | Default |
|---------|-------|---------|
| Recognition Threshold | 0.3-0.7 | 0.5 |
| Cooldown (minutes) | 1-60 | 5 |
| Grace Period (minutes) | 0-10 | 1 |
| Session Timeout (minutes) | 5-120 | 30 |
| Camera Resolution | 320-1920 | 360 |
| Enable Encryption | true/false | true |
| Require Liveness | true/false | true |

---

## 📱 Screenshots

The app features:
- 🎥 Circular camera view with green theme
- 📊 Dashboard with Present/Late/Absent stats
- 📋 Employee cards with department/role badges
- ⚙️ Tabbed settings panel
- 🟢 Online/Offline indicator with pending count

---

## 🤝 Contributing

1. Fork the repo
2. Create feature branch
3. Commit changes
4. Push & PR

---

## 📄 License

MIT License

---

Built with ❤️ | Anushka Dange