# eLoan — Cooperative Loan Management System

A full-stack loan management system for cooperatives, featuring biometric identity verification (face recognition + liveness detection), document OCR, role-based workflows, and a multi-platform architecture.

---

## System Architecture

```
eLoanV1B/
├── venv/               # Python virtual environment (project root)
├── backend/            # Django REST API (Python 3.12)
├── frontend/           # Web dashboard — React + Vite (Bookkeeper / Treasurer / Credit Committee)
└── applicant-app/      # Mobile app — React Native + Expo (Applicants)
```

---

## Features

- **Applicant mobile app** — loan application with face capture, liveness video, and ID document upload
- **Face verification** — DeepFace (ArcFace model) comparing selfie vs. ID photo with three-tier result: Verified / Needs Review / Failed
- **Liveness detection** — MediaPipe FaceLandmarker analyzing eye state, head pose, and face size across video frames
- **OCR** — Tesseract extracting text from uploaded ID documents
- **File encryption** — Fernet (AES-128) encrypting all uploaded documents at rest
- **Role-based web dashboards** — Bookkeeper, Treasurer, Credit Committee each have dedicated views
- **Security alerts** — suspicious verification failures automatically notified to Super Administrators
- **JWT authentication** — access + refresh token flow

---

## User Roles

| Role | Access |
|------|--------|
| Applicant | Mobile app — submit loan applications |
| Bookkeeper | Web — review applications, face verification, document checks |
| Treasurer | Web — evaluate financials, input payslip salary |
| Credit Committee | Web — final approval/rejection |
| Super Administrator | Django admin — full system access, security alerts |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Django 6, Django REST Framework |
| Database | MySQL 8 |
| Authentication | JWT (SimpleJWT) |
| Face Recognition | DeepFace + ArcFace, OpenCV |
| Liveness Detection | MediaPipe FaceLandmarker (Tasks API) |
| OCR | Tesseract + pytesseract |
| Encryption | Python `cryptography` (Fernet) |
| Mobile App | React Native 0.81, Expo 54 |
| Web Frontend | React 19, Vite 7 |
| Admin UI | django-unfold |

---

## Prerequisites

Install these on the new device before anything else:

| Tool | Version | Notes |
|------|---------|-------|
| Python | **3.12 exactly** | mediapipe does not support 3.13+ |
| MySQL | 8.x | |
| Node.js | 18+ LTS | |
| Git | any | |
| Tesseract OCR | latest | Windows: [download installer](https://github.com/UB-Mannheim/tesseract/wiki), install to default path `C:\Program Files\Tesseract-OCR\` |

---

## Setup Guide

### 1. Clone the repository

```bash
git clone https://github.com/maica-myosotis/eLoan.git
cd eLoan
git checkout maica
```

---

### 2. Find your local IP address

You'll need this for all three apps to communicate.

```bash
# Windows
ipconfig
# Look for "IPv4 Address" under your active Wi-Fi or Ethernet adapter
# Example: 192.168.1.10
```

---

### 3. Backend (Django)

#### Create the database

```sql
-- In MySQL shell or MySQL Workbench
CREATE DATABASE eloan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

#### Create virtual environment and install dependencies

The venv lives at the **project root** (not inside `backend/`):

```bash
# From the project root (eLoanV1B/)
python -m venv venv

# Activate
python -m venv venv       # Windows
source venv/bin/activate     # Mac/Linux

# Install in this order to avoid conflicts between mediapipe and tensorflow
pip install tensorflow tf-keras deepface
pip install mediapipe
pip install -r backend/requirements.txt
```

#### Create the `.env` file

Create `backend/.env` with the following content:

```env
# Email
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your@gmail.com
EMAIL_HOST_PASSWORD=your-gmail-app-password
DEFAULT_FROM_EMAIL=your@gmail.com

# Frontend URL (used in password reset emails)
FRONTEND_URL=http://<your-local-ip>:3000

# Runtime
DJANGO_DEBUG=True
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe

# File Encryption Key
# IMPORTANT: Copy this exactly from the original machine.
# Generating a new key will make all existing uploaded documents unreadable.
ENCRYPTION_KEY=<paste key from original .env>

# Database
DB_NAME=eloan
DB_USER=root
DB_PASSWORD=<your mysql root password>
DB_HOST=localhost
DB_PORT=3306
```

> **Gmail App Password:** Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), generate an app password, and use it as `EMAIL_HOST_PASSWORD`. Your regular Gmail password will not work.

#### Run migrations and start

```bash
cd backend
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8000
```

The API will be available at `http://<your-local-ip>:8000`.

---

### 4. Web Frontend (Bookkeeper / Treasurer / Credit Committee)

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_API_URL=http://<your-local-ip>:8000/api/auth
```

Then start the dev server:

```bash
npm run dev -- --host
```

The web app will be available at `http://<your-local-ip>:3000`.

---

### 5. Mobile App (Applicants)

```bash
cd applicant-app
npm install
```

Set the API URL before starting Expo:

```bash
# Windows PowerShell
$env:EXPO_PUBLIC_API_URL="http://<your-local-ip>:8000/api/auth"
```

Install Expo CLI if not already installed:

```bash
npm install -g expo-cli
```

Start the app:

```bash
npx expo start
```

Scan the QR code with the **Expo Go** app on your phone. Your phone and computer must be on the **same Wi-Fi network**.

---

## Setup Checklist

- [ ] Python 3.12 installed (check with `python --version`)
- [ ] MySQL running and `eloan` database created
- [ ] Tesseract installed at `C:\Program Files\Tesseract-OCR\` (Windows)
- [ ] `venv` created at project root and activated
- [ ] `backend/.env` created with correct DB credentials and IP
- [ ] `ENCRYPTION_KEY` copied exactly from original machine
- [ ] `VITE_API_URL` set in `frontend/.env`
- [ ] `EXPO_PUBLIC_API_URL` set before starting the applicant app
- [ ] Backend dependencies installed in the correct order (tensorflow → mediapipe → requirements.txt)
- [ ] `python manage.py migrate` ran successfully
- [ ] Superuser created

---

## Common Issues

### `mediapipe` install fails or conflicts with tensorflow
Install in this exact order:
```bash
pip install tensorflow tf-keras deepface
pip install mediapipe
pip install -r backend/requirements.txt
```

### Face verification times out on first request
Normal — DeepFace/TensorFlow loads the ArcFace model on the first request (~60–120s). The server warms up the model in the background on startup. Wait a minute before testing face verification.

### Encrypted files unreadable after moving to new machine
The `ENCRYPTION_KEY` in `.env` must be identical to the original. Copy it exactly — do not regenerate it.

### Expo app can't connect to backend
- Phone and laptop must be on the same Wi-Fi
- Check the IP in `app.json` and `apiService.js` matches your current machine's IP (`ipconfig`)
- Make sure Django is running with `0.0.0.0:8000` (not `127.0.0.1`)

### MySQL connection error
Make sure MySQL service is running and the credentials in `backend/.env` match your MySQL setup.
