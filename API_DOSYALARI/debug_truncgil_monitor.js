const https = require('https');

const url = 'https://finans.truncgil.com/today.json';
let lastUpdate = '';

console.log('📡 Truncgil API Monitor Started (Polling every 10s)...');

function check() {
    https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                const currentUpdate = json.Update_Date; // Truncgil timestamp

                if (currentUpdate !== lastUpdate) {
                    console.log(`✅ NEW DATA! Server Time: ${currentUpdate} | Local: ${new Date().toLocaleTimeString()}`);
                    console.log(`   Gold: ${json['gram-altin'].Satış} | USD: ${json['USD'].Satış}`);
                    lastUpdate = currentUpdate;
                } else {
                    process.stdout.write('.'); // No change
                }
            } catch (e) {
                console.log('Error parsing JSON');
            }
        });
    }).on('error', (e) => {
        console.log('Error fetching:', e.message);
    });
}

setInterval(check, 10000);
check();
