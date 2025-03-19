import axios from 'axios'
import chalk from 'chalk'
import * as fs from 'fs/promises';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { displayBanner } from './utils/banner.js';

class KaleidoMiningBot {
    constructor(wallet, botIndex) {
        this.wallet = wallet;
        this.botIndex = botIndex;
        this.currentEarnings = { total: 0, pending: 0, paid: 0 };
        this.miningState = {
            isActive: false,
            worker: "quantum-rig-1",
            pool: "quantum-1",
            startTime: null
        };
        this.referralBonus = 0;
        this.stats = {
            hashrate: 75.5,
            shares: { accepted: 0, rejected: 0 },
            efficiency: 1.4,
            powerUsage: 120
        };
        this.sessionFile = `session_${wallet}.json`;
        this.session = null;
        this.pausedDuration = 0;
        this.pauseStart = null;
        this.api = axios.create({
            baseURL: 'https://kaleidofinance.xyz/api/testnet',
            headers: {
                'Content-Type': 'application/json',
                'Referer': 'https://kaleidofinance.xyz/testnet',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
            }
        });
    }

    async loadSession() {
        try {
            const data = await fs.readFile(this.sessionFile, 'utf8');
            const sessionData = JSON.parse(data);
            this.miningState.startTime = sessionData.startTime;
            this.currentEarnings = sessionData.earnings;
            this.referralBonus = sessionData.referralBonus;
            this.session = sessionData.session || Math.floor(Math.random() * 1000000);
            this.pausedDuration = sessionData.pausedDuration || 0;
            console.log(chalk.red(`[Wallet ${this.botIndex}] Previous session loaded successfully`));
            return true;
        } catch (error) {
            this.session = Math.floor(Math.random() * 1000000);
            return false;
        }
    }

    async saveSession() {
        const sessionData = {
            startTime: this.miningState.startTime,
            earnings: this.currentEarnings,
            referralBonus: this.referralBonus,
            session: this.session,
            pausedDuration: this.pausedDuration
        };
        try {
            await fs.writeFile(this.sessionFile, JSON.stringify(sessionData, null, 2));
        } catch (error) {
            console.error(chalk.red(`[Wallet ${this.botIndex}] Failed to save session:`), error.message);
        }
    }

    async initialize() {
        try {
            const regResponse = await this.retryRequest(
                () => this.api.get(`/check-registration?wallet=${this.wallet}`),
                "Registration check"
            );
            if (!regResponse.data.isRegistered) {
                throw new Error('Wallet not registered');
            }

            const hasSession = await this.loadSession();
            if (!hasSession) {
                this.referralBonus = regResponse.data.userData.referralBonus;
                this.currentEarnings = {
                    total: regResponse.data.userData.referralBonus || 0,
                    pending: 0,
                    paid: 0
                };
                this.miningState.startTime = Date.now();
            }

            this.miningState.isActive = true;
            console.log(chalk.cyan(`[Wallet ${this.botIndex}] Mining ${hasSession ? 'resumed' : 'initialized'} successfully`));
            await this.startMiningLoop();
        } catch (error) {
            console.error(chalk.red(`[Wallet ${this.botIndex}] Initialization failed: ${error.message}`));
            console.log(chalk.yellow(`[Wallet ${this.botIndex}] Retrying initialization in 10 seconds...`));
            setTimeout(() => this.initialize(), 10000);
        }
    }

    async retryRequest(requestFn, operationName, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                return await requestFn();
            } catch (error) {
                const status = error.response ? error.response.status : null;
                if (status === 400 || status === 401) {
                    console.error(chalk.red(`[${operationName}] Request failed with status ${status}: ${error.response?.data?.message || error.message}`));
                    throw error;
                }

                const delay = Math.pow(2, i) * 1000;
                console.log(chalk.yellow(`[${operationName}] Error (status: ${status || 'unknown'}). Retrying (${i + 1}/${retries}) in ${delay / 1000} seconds...`));
                if (error.response && error.response.headers && error.response.headers['retry-after']) {
                    const retryAfter = parseInt(error.response.headers['retry-after'], 10) * 1000;
                    await new Promise(resolve => setTimeout(resolve, retryAfter));
                } else {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        console.error(chalk.red(`[${operationName}] All retries failed.`));
        throw new Error(`${operationName} failed after ${retries} attempts.`);
    }

    calculateEarnings() {
        const effectiveElapsed = (Date.now() - this.miningState.startTime - this.pausedDuration) / 1000;
        return (this.stats.hashrate * effectiveElapsed * 0.0001) * (1 + this.referralBonus);
    }

    async updateBalance(finalUpdate = false) {
        try {
            if (this.pauseStart) {
                const downtime = Date.now() - this.pauseStart;
                this.pausedDuration += downtime;
                console.log(chalk.yellow(`[Wallet ${this.botIndex}] Resumed after downtime of ${(downtime / 1000).toFixed(2)} seconds.`));
                this.pauseStart = null;
            }

            const newEarnings = this.calculateEarnings();
            if (!finalUpdate && newEarnings < 0.00000001) {
                return;
            }

            const payload = {
                wallet: this.wallet,
                earnings: {
                    total: this.currentEarnings.total + newEarnings,
                    pending: finalUpdate ? 0 : newEarnings,
                    paid: finalUpdate ? this.currentEarnings.paid + newEarnings : this.currentEarnings.paid,
                    session: this.session
                }
            };

            const response = await this.retryRequest(
                () => this.api.post('/update-balance', payload),
                "Balance update"
            );

            if (response.data.success) {
                this.currentEarnings = {
                    total: response.data.balance,
                    pending: finalUpdate ? 0 : newEarnings,
                    paid: finalUpdate ? this.currentEarnings.paid + newEarnings : this.currentEarnings.paid
                };
                await this.saveSession();
                this.logStatus(finalUpdate);
            }
        } catch (error) {
            if (!this.pauseStart) {
                this.pauseStart = Date.now();
                console.log(chalk.yellow(`[Wallet ${this.botIndex}] Entering maintenance mode, pausing earnings calculation.`));
            }
            console.error(chalk.red(`[Wallet ${this.botIndex}] Update failed: ${error.message}`));
            throw error;
        }
    }

    formatUptime(seconds) {
        let sec = Math.floor(seconds);
        const months = Math.floor(sec / (30 * 24 * 3600));
        sec %= (30 * 24 * 3600);
        const weeks = Math.floor(sec / (7 * 24 * 3600));
        sec %= (7 * 24 * 3600);
        const days = Math.floor(sec / (24 * 3600));
        sec %= (24 * 3600);
        const hours = Math.floor(sec / 3600);
        sec %= 3600;
        const minutes = Math.floor(sec / 60);
        const secondsLeft = sec % 60;
        let parts = [];
        if (months > 0) parts.push(`${months}MO`);
        if (weeks > 0) parts.push(`${weeks}W`);
        if (days > 0) parts.push(`${days}D`);
        parts.push(`${hours}H`);
        parts.push(`${minutes}M`);
        parts.push(`${secondsLeft}S`);
        return parts.join(':');
    }

maskWallet(wallet) {
    // Sembunyikan semua karakter kecuali 4 karakter terakhir
    const visiblePart = wallet.slice(-4); // Menampilkan 4 karakter terakhir
    const maskedPart = wallet.slice(0, wallet.length - 4).replace(/./g, "*"); // Menyembunyikan sisanya dengan *
    return maskedPart + visiblePart;
}

logStatus(final = false) {
    const statusType = final ? "Final Status" : "Mining Status";
    const uptimeSeconds = (Date.now() - this.miningState.startTime - this.pausedDuration) / 1000;
    const formattedUptime = this.formatUptime(uptimeSeconds);
    const activeStatus = this.miningState.isActive ? chalk.green('true') + ' ✅' : chalk.red('false ❌');
    
    // Menggunakan maskWallet untuk memproses wallet sebelum ditampilkan
    const maskedWallet = this.maskWallet(this.wallet);  // Asumsi `this.wallet` adalah wallet yang ingin dimask

    console.log(chalk.yellow("══════════════════════════════════════════════════"));
    console.log(chalk.green(`📌 Loaded Wallet [${chalk.white.bold(this.botIndex)}]`));
    console.log(chalk.green(`📌 Status Proges [${chalk.white.bold(statusType)}]`));
    console.log(chalk.green(`📌  For wallet: [${chalk.whiteBright(maskedWallet)}]`)); // Menampilkan wallet yang dimask
    console.log(chalk.yellow("══════════════════════════════════════════════════"));
    console.log(chalk.white(`➜ Uptime        : ${chalk.cyan(formattedUptime)}`));
    console.log(chalk.white(`➜ Active        : ${activeStatus}`));
    console.log(chalk.white(`➜ Hashrate      : ${chalk.cyan(`${this.stats.hashrate} MH/s`)}`));
    console.log(chalk.white(`➜ Total Earned  : ${chalk.cyan(`${this.currentEarnings.total.toFixed(8)} KLDO`)}`));
    console.log(chalk.white(`➜ Pending       : ${chalk.cyan(`${this.currentEarnings.pending.toFixed(8)} KLDO`)}`));
    console.log(chalk.white(`➜ Paid          : ${chalk.cyan(`${this.currentEarnings.paid.toFixed(8)} KLDO`)}`));
    console.log(chalk.white(`➜ Referral Bonus: ${chalk.cyan(`+${(this.referralBonus * 100).toFixed(2)}%`)}`));
    console.log(chalk.yellow("══════════════════════════════════════════════════"));
}

    async startMiningLoop() {
        while (this.miningState.isActive) {
            try {
                await this.updateBalance();
            } catch (error) {
                console.error(chalk.red(`[Wallet ${this.botIndex}] API error detected, switching to offline mode.`));
                console.log(chalk.yellow(`[Wallet ${this.botIndex}] Retrying in 60 seconds...`));
                await new Promise(resolve => setTimeout(resolve, 60000));
            }
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
    }

    async stop() {
        this.miningState.isActive = false;
        await this.updateBalance(true);
        await this.saveSession();
        return this.currentEarnings.paid;
    }
}

export class MiningCoordinator {
    static instance = null;
    constructor() {
        if (MiningCoordinator.instance) {
            return MiningCoordinator.instance;
        }
        MiningCoordinator.instance = this;
        this.bots = [];
        this.totalPaid = 0;
        this.isRunning = false;
    }

    async loadWallets() {
        try {
            const __dirname = dirname(fileURLToPath(import.meta.url));
            const data = await readFile(join(__dirname, 'wallets.json'), 'utf8');
            return data.split('\n')
                .map(line => line.trim())
                .filter(line => line.startsWith('0x'));
        } catch (error) {
            console.error('Error loading wallets:', error.message);
            return [];
        }
    }

    async start() {
        if (this.isRunning) {
            console.log(chalk.yellow('Mining coordinator is already running'));
            return;
        }

        this.isRunning = true;
        displayBanner();
        const wallets = await this.loadWallets();
        if (wallets.length === 0) {
            console.log(chalk.red('No valid wallets found in wallets.json'));
            return;
        }

        console.log(chalk.blue(`Loaded ${wallets.length} wallets\n`));
        // Jalankan bot untuk setiap wallet
        for (const [index, wallet] of wallets.entries()) {
            const bot = new KaleidoMiningBot(wallet, index + 1);
            this.bots.push(bot); // Simpan bot ke array
            bot.initialize();
        }

        process.on('SIGINT', async () => {
      console.log(chalk.white('\n💾  Proses Mining Dihentikan...'));
      this.totalPaid = (await Promise.all(this.bots.map(bot => bot.stop())))
        .reduce((sum, paid) => sum + paid, 0);

      console.log(chalk.yellow("\n════════════════════════════════════════"));
console.log(chalk.green.bold("       💰 Payment & Wallets Detail 💰      "));
console.log(chalk.yellow("════════════════════════════════════════"));

console.log(`🟢 ${chalk.cyan.bold("Total Wallets  :")} ${chalk.magenta(this.bots.length)}`);
console.log(`💸 ${chalk.cyan.bold("Total Paid     :")} ${chalk.green(this.totalPaid.toFixed(8))} KLDO`);

console.log(chalk.yellow("════════════════════════════════════════\n"));
      process.exit();
    });
  }
}
