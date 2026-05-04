import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fetch from 'node-fetch';

const execAsync = promisify(exec);
const BOT_TOKEN = "8790537676:AAGtSub4zRjsFDdU2MzHzbzyN9UIgnuDGgQ";
const CHAT_ID = "8735175607";

async function sendTelegram(text) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, text: text })
        });
    } catch (e) {
        console.error("Failed to send telegram message", e);
    }
}

async function checkBuild() {
    try {
        const { stdout } = await execAsync('cd ../mobile_app && npx eas-cli build:list --limit 1 --json --non-interactive');
        const builds = JSON.parse(stdout);
        const latest = builds[0];

        if (latest.status === 'finished') {
            const url = latest.artifacts?.buildUrl;
            if (url) {
                await sendTelegram(`✅ Pig Health Monitor APK is ready!\n\nHere is your direct download link (no login required):\n${url}`);
                console.log("Done!");
                process.exit(0);
            }
        } else if (latest.status === 'errored') {
            await sendTelegram(`❌ Pig Health Monitor EAS build failed!`);
            process.exit(1);
        }
    } catch (e) {
        console.error("Error polling EAS:", e);
    }
}

console.log("Starting EAS polling daemon...");
setInterval(checkBuild, 60000); // Check every minute
checkBuild();
