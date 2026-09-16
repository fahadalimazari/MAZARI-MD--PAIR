# 👑 MAZARI MD | PAIRING 👑

![MAZARI MD](https://img.shields.io/badge/MAZARI%20MD-VIP%20EDITION-ff3344?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Active-brightgreen?style=for-the-badge)

Welcome to the **MAZARI MD Pairing Portal**, the official frontend and pairing server interface designed exclusively for the MAZARI MD WhatsApp Bot network.

This repository contains **only** the pairing website and backend logic required to pair new sessions. The actual bot source code is maintained in a separate private repository to ensure maximum security.

---

## 🌟 Premium VIP Features

- **Multi-Server Routing**: Securely connects to 48 independent MAZARI MD servers worldwide via a premium frontend selector.
- **Responsive UI/UX**: Built with a sleek, dark-crimson glassmorphism aesthetic that scales perfectly across desktop, tablet, and mobile.
- **Dynamic Session Handling**: Real-time WhatsApp pairing state reflection, including loading spinners, connection status, and instant error handling.
- **Seamless Copy Functionality**: 1-click clipboard integration for rapid pairing code deployment.

## 🚀 How to Run

To run the pairing portal locally or deploy it to a fresh server instance:

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/fahadalimazari/MAZARI-MD--PAIR.git
   cd MAZARI-MD--PAIR
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   Ensure you have configured your local PostgreSQL `DATABASE_URL` if you intend to run the backend routing test server locally. 

4. **Start the Server:**
   ```bash
   npm start
   ```

5. **Access the Portal:**
   Navigate to `http://localhost:8000` to view the VIP Server Selector.

## 🛡️ Security & Scope

* **No Bot Logic:** This repository is strictly for generating and routing WhatsApp pairing codes. It contains zero bot commands or plugin logic.
* **Database Isolation:** Sessions are handled through isolated schemas ensuring cross-server security.
* **Environment Variables:** Never commit `.env` files or hardcoded database strings.

---

*MADE BY MAZARI HACKER · MINI BOT EDITION*
