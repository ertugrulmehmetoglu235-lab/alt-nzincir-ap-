const fs = require('fs');
const https = require('https');

function fetchJSON(url) {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

function parsePrice(str, type) {
    if (!str) return 0;
    // Altın formatı: 2.500,00 -> 2500.00
    // Döviz formatı: 34,50 -> 34.50
    if (type === 'gold' || type?.includes('altin')) return parseFloat(str.toString().replace(/\./g, '').replace(',', '.'));
    return parseFloat(str.toString().replace(',', '.'));
}

async function update() {
    try {
        const myData = JSON.parse(fs.readFileSync('data.json', 'utf8'));
        const now = new Date();
        const timeStr = now.toLocaleString('tr-TR');

        // 1. TRUNCGIL API (Altın ve Döviz)
        const trData = await fetchJSON('https://finans.truncgil.com/today.json') || {};

        // 2. COINCAP API (Kripto) — USD bazlı gelir
        const ccData = await fetchJSON('https://api.coincap.io/v2/assets?limit=50') || {};
        const cryptoMap = {};
        if (ccData && ccData.data) {
            ccData.data.forEach(c => { cryptoMap[c.symbol] = parseFloat(c.priceUsd); });
        }

        // Kriptoları TL'ye çevirmek için dolar kuru lazım
        const USDTRY = (trData['USD'] && trData['USD'].Satış) ? parsePrice(trData['USD'].Satış, 'currency') : 35;

        // Tüm varlıkları döngüye al
        Object.keys(myData).forEach(key => {
            const item = myData[key];

            // ALTIN ve DÖVİZ (Truncgil'den geliyorsa)
            if (trData[key]) {
                const livePrice = parsePrice(trData[key].Satış, item.type);
                item.current = livePrice;
                item.last_update = timeStr;
            }

            // KRİPTO (CoinCap'ten geliyorsa)
            else if (item.type === 'crypto' && cryptoMap[item.code]) {
                item.current = parseFloat((cryptoMap[item.code] * USDTRY).toFixed(2));
                item.last_update = timeStr;
            }

            // Gün Sonu: Veriyi geçmişe ekle (23:50'den sonra çalışırsa)
            if (now.getHours() === 23 && now.getMinutes() > 50 && item.current) {
                item.history.push(item.current);
                // 5 yıllık (haftalık) veya 1 yıllık (günlük) sınırı korumak için
                if (item.history.length > 365) item.history.shift();
            }
        });

        fs.writeFileSync('data.json', JSON.stringify(myData, null, 2));
        console.log('✅ Veritabanı güncellendi: ' + timeStr);
    } catch (e) {
        console.error('❌ Hata:', e);
        process.exit(1);
    }
}

update();
