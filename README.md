# Kaleido-BOT
### Kaleido  BOT is an automated script for mining KLDO tokens from Kaleido Finance Testnet. It enables multi-wallet mining while following Kaleido's latest security measures to avoid bans and rate limits.
---

   # ❤ BIG THANKS FOR CRYPTOKOM 

Let's Join Grub Discussion [**CRYPTOKOM**](https://t.me/cryptokom1) and Channel [**CRYPTOKOM2**](https://t.me/cryptokom2)

---
# ⚠️ Essential Security Rules #

To ensure optimal performance and prevent account restrictions, please adhere to the following guidelines:

Account & Device Restrictions: A maximum of 2 accounts per device and 5 accounts per IP subnet (including Hotspots) are allowed. Exceeding these limits can result in temporary or permanent bans.

VPN/Proxy Limitations: Using VPNs or proxies can lead to detection and account suspension. Always connect through a genuine, unaltered network.

Anti-Bot Measures: The bot mimics human-like behavior to avoid detection. Refrain from making frequent mining requests within a short timeframe.

Request Frequency: Mining attempts are limited to 5 per hour per account. Exceeding this limit may trigger temporary cooldowns or account restrictions.



---

This version maintains the same message but adjusts the structure and wording for variety.

# 📌 Key Features
✅ **Session Management**
•Saves each wallet's mining session in a session_{wallet}.json file.
•Resumes previous sessions upon restart.

✅ **Auto-Retry & Error Handling**
•Exponential Backoff: If an API error occurs, the script retries with an increasing delay.
•Status Code Handling: Handles 400, 401 errors (permanent failure) and 429, 5xx errors (retry with delay).

✅ **Mining Status & Earnings Tracking**
•Displays mining statistics

✅ **Referral Bonus System**
•Automatically detects and applies referral bonuses to mining earnings.

✅ **Cross-Platform Compatibility**:
•Works on Windows, macOS, Linux, *Android (run with ubuntu proot/chroot).

---
# ⚙️ Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/MICSY-xyz/kaleido-BOT.git
   cd kaleido-BOT
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Edit the wallets.json file using nano/vim, then add your wallet addresses (one per line):
   ```bash
   nano wallets.json
   ```
4. Run Bot
   ```bash
   npm run start
   ```
