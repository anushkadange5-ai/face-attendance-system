# 🎯 Face Biometric Attendance System

A **standalone offline-first** face recognition attendance application with real-time detection, employee management, and comprehensive reporting.

---

## ✨ Features

### 🎥 Face Recognition
- ✅ Real-time face detection using face-api.js (TinyFaceDetector)
- ✅ Face embedding extraction (128-dimensional descriptors)
- ✅ Liveness detection (anti-spoofing via head movement + blink detection)
- ✅ Configurable recognition threshold (0.3 - 0.7)
- ✅ Duplicate face detection during enrollment

### 👥 Employee Management
- ✅ Multi-field enrollment (ID, Name, Department, Role, Shift)
- ✅ Multiple face capture (front + left + right profiles)
- ✅ Employee photo storage
- ✅ Department-based filtering & search
- ✅ Employee deletion with cascade attendance removal

### ⏱️ Attendance Logic
- ✅ Auto LOGIN on first detection
- ✅ Auto LOGOUT on second detection
- ✅ Configurable cooldown period (prevents duplicate marks)
- ✅ Grace period for late detection
- ✅ Shift-based timing (Morning, General, Afternoon, Night)
- ✅ Late/Early/Half-day detection

### 📊 Reporting & Export
- ✅ Real-time dashboard with stats
- ✅ Monthly attendance reports
- ✅ PDF export (per employee / all employees)
- ✅ Excel/CSV export
- ✅ Late count, working hours calculation

### 🗄️ Data Storage
- ✅ **Offline-first** (IndexedDB as primary database)
- ✅ Cloud sync to Firestore when online
- ✅ Outbox queue for offline writes
- ✅ Conflict resolution (local-first strategy)

### 🔐 Security
- ✅ Firebase Authentication for admin
- ✅ Face embedding encryption (AES-GCM)
- ✅ Liveness detection (prevents photo spoofing)
- ✅ Admin session management

### ⚙️ Settings Panel
- ✅ Recognition threshold configuration
- ✅ Cooldown period settings
- ✅ Grace time configuration
- ✅ Camera selection (filters virtual cameras)
- ✅ Liveness sensitivity settings
- ✅ UI preferences (voice, status badge)
- ✅ Data backup & restore

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| UI | React 19 + Vite + TailwindCSS |
| Face Recognition | face-api.js (TensorFlow.js) |
| Authentication | Firebase Auth |
| Database | IndexedDB (idb library) |
| Cloud Sync | Firestore |
| PDF Export | jsPDF + jspdf-autotable |
| Excel Export | SheetJS (xlsx) |
| Encryption | Web Crypto API (AES-GCM) |

---

## 📁 Project Structure

```
face-attendance-system/
├── face-app/
│   ├── public/
│   │   └── models/           # face-api.js model files
│   ├── src/
│   │   ├── components/
│   │   │   ├── AdminDashboard.jsx   # Admin panel with enrollment
│   │   │   ├── AdminLogin.jsx       # Admin authentication
│   │   │   ├── Camera.jsx           # Face scanner (employee view)
│   │   │   ├── EmployeeDetails.jsx  # Employee history modal
│   │   │   ├── EmployeeTable.jsx    # Employee list with filters
│   │   │   ├── SettingsPanel.jsx    # System configuration
│   │   │   └── AttendanceList.jsx   # Attendance view
│   │   ├── utils/
│   │   │   ├── backup.js      # Backup/restore utilities
│   │   │   ├── encryption.js  # Face embedding encryption
│   │   │   ├── exportExcel.js # Excel export
│   │   │   ├── exportPDF.js   # PDF export
│   │   │   ├── settings.js    # System settings
│   │   │   ├── shifts.js      # Shift definitions
│   │   │   └── time.js        # Time utilities
│   │   ├── App.jsx            # Main app component
│   │   ├── authService.js     # Firebase auth wrapper
│   │   ├── db.js              # Database facade
│   │   ├── faceService.js     # Face recognition engine
│   │   ├── firebase.js        # Firebase config
│   │   ├── localDb.js         # IndexedDB wrapper
│   │   └── syncService.js     # Online/offline sync
│   ├── index.html
│   └── package.json
└── README.md
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
cd face-app
npm install
```

### 2. Download Face API Models
Download the following model files into `public/models/`:
- `tiny_face_detector/model.json`
- `face_landmark_68_model/model.json`
- `face_recognition_model/model.json`

From: https://github.com/justadudewhohacks/face-api.js/tree/master/weights

### 3. Configure Firebase
Update `src/firebase.js` with your Firebase project credentials.

### 4. Run Development Server
```bash
npm run dev
```

### 5. Build for Production
```bash
npm run build
```

---

## ⚙️ Configuration

### Shifts (`src/utils/shifts.js`)
```javascript
export const SHIFTS = {
  morning: { id: "morning", label: "Morning", emoji: "🌅", loginAt: "07:00", logoutAt: "15:00" },
  general: { id: "general", label: "General", emoji: "☀️", loginAt: "09:00", logoutAt: "17:00" },
  afternoon: { id: "afternoon", label: "Afternoon", emoji: "🌇", loginAt: "13:00", logoutAt: "21:00" },
  night: { id: "night", label: "Night", emoji: "🌙", loginAt: "21:00", logoutAt: "05:00" },
};
```

### Settings (`src/utils/settings.js`)
Configurable via Settings Panel in admin dashboard:
- Recognition threshold (0.3 - 0.7)
- Cooldown period (1 - 60 minutes)
- Grace period (0 - 10 minutes)
- Session timeout (5 - 120 minutes)
- Camera resolution
- Liveness detection sensitivity

---

## 🎯 Usage Flow

### Employee Enrollment
1. Admin logs in
2. Click "Enroll Employee"
3. Enter Employee ID, Name, Department, Role, Shift
4. Capture 3 face angles (front, left, right)
5. System verifies liveness and saves

### Attendance Marking
1. Employee faces the camera
2. System detects face + verifies liveness
3. If no login today → marks LOGIN
4. If login exists → marks LOGOUT
5. Voice announcement confirms action

### Viewing Reports
1. Click employee card to see history
2. Filter by month
3. Export as PDF or Excel

---

## 🔒 Security Features

- **Liveness Detection**: Requires natural head movement + blinking
- **Minimum Face Size**: Rejects photos held far from camera
- **Cooldown Period**: Prevents rapid duplicate marks
- **Embedding Encryption**: Face data encrypted with AES-256-GCM
- **Admin Authentication**: Firebase Auth required for admin access
- **Session Timeout**: Auto-logout after configurable inactivity

---

## 📱 Responsive Design

- Works on Desktop, Tablet, and Mobile
- Touch-friendly interface
- Camera selection for devices with multiple cameras

---

## 🌐 Offline Capabilities

- Full functionality without internet
- Local IndexedDB storage
- Automatic sync when online
- Outbox queue for pending writes

---

## 📄 License

MIT License - Feel free to use and modify.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

Built with ❤️ using React, face-api.js, and Firebase