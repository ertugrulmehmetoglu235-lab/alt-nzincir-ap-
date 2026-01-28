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
    if (type === 'gold' || type?.includes('altin')) return parseFloat(str.toString().replace(/\./g, '').replace(',', '.'));
    return parseFloat(str.toString().replace(',', '.'));
}

function parseDate(str) {
    if (!str) return null;
    try {
        const [datePart, timePart] = str.split(' ');
        const [day, month, year] = datePart.split('.');
        if (timePart) {
            const [hour, min, sec] = timePart.split(':');
            return new Date(year, month - 1, day, hour, min, sec || 0);
        }
        return new Date(year, month - 1, day);
    } catch (e) { return null; }
}

async function update() {
    try {
        const myData = JSON.parse(fs.readFileSync('data.json', 'utf8'));
        const now = new Date();
        const timeStr = now.toLocaleString('tr-TR');
        const currentHour = now.getHours();
        const currentDay = now.getDate();

        // 1. TRUNCGIL API (Altın ve Döviz)
        const trData = await fetchJSON('https://finans.truncgil.com/today.json') || {};

        // 2. COINCAP API (Kripto)
        const ccData = await fetchJSON('https://api.coincap.io/v2/assets?limit=50') || {};
        const cryptoMap = {};
        if (ccData && ccData.data) {
            ccData.data.forEach(c => { cryptoMap[c.symbol] = parseFloat(c.priceUsd); });
        }

        const USDTRY = (trData['USD'] && trData['USD'].Satış) ? parsePrice(trData['USD'].Satış, 'currency') : 35;

        // Tüm varlıkları döngüye al
        Object.keys(myData).forEach(key => {
            const item = myData[key];
            const oldDate = parseDate(item.last_update);

            // Eğer daha önce hiç güncellenmediyse, şu anı kabul et
            const lastHour = oldDate ? oldDate.getHours() : -1;
            const lastDay = oldDate ? oldDate.getDate() : -1;

            // FİYAT GÜNCELLEME
            if (trData[key]) { // Truncgil
                const livePrice = parsePrice(trData[key].Satış, item.type);
                if (livePrice > 0) item.current = livePrice;
            }
            else if (item.type === 'crypto' && cryptoMap[item.code]) { // CoinCap
                item.current = parseFloat((cryptoMap[item.code] * USDTRY).toFixed(2));
            }
            // ONS Fix
            else if (key === 'ons' && trData['ons']) {
                const livePrice = parsePrice(trData['ons'].Satış, item.type);
                if (livePrice > 0) item.current = livePrice;
            }

            // GÜNCELLEME ZAMANI
            item.last_update = timeStr;

            // --- ZAMANSAL MANTIK ve ARŞİVLEME ---
            if (!item.intraday) item.intraday = [];

            // 1. GÜN DEĞİŞİMİ (GECE YARISI GEÇİŞİ)
            // Eğer veritabanındaki "son güncelleme günü" bugünden farklıysa (örn: dünde kaldıysa)
            // Demek ki yeni güne geçtik. Dünü kapat.
            if (lastDay !== -1 && lastDay !== currentDay) {
                // Dünün kapanışını (şu anki current aslında hala dünün kapanışı sayılır, eğer yeni fiyat gelmediyse)
                // Ama biz garanti olsun diye şu anki fiyatı history'ye atalım.
                if (item.current > 0) item.history.push(item.current);

                // Günlük listeyi temizle
                item.intraday = [];

                // Limit
                if (item.history.length > 365) item.history.shift();
            }

            // 2. SAAT BAŞI KAYIT (Gün İçi Veri)
            // Eğer "son güncelleme saati" şimdiki saatten farklıysa, yeni bir saate girmişiz demektir.
            // Örnek: last=14:59, now=15:00 -> Farklı. Kaydet.
            // Örnek: last=15:00, now=15:01 -> Aynı. Kaydetme.
            if (lastHour !== currentHour && item.current > 0) {
                item.intraday.push(item.current);
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
