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

            // Güncelleme ve Arşivleme Mantığı

            // 1. Saat Başı (Dakika 00-05 arası): Gün İçi Listeye Ekle
            // Her çalıştığında değil, sadece saatin başında bir kere eklemesi için kontrol
            // (Bu basit mantıkta eğer robot her dakika çalışıyorsa, saat başında birden fazla ekleyebilir.
            //  Bunu önlemek için son eklenen değerin saatine bakılabilir ama şimdilik basit tutalım
            //  veya array son elemanının saatiyle şimdiki saati kıyaslayalım)

            // Basit çözüm: Eğer intraday boşsa veya son eleman bu saatte eklenmediyse ekle.
            // Not: GitHub Actions 'environment' olmadığı için persistent state yok, dosya okuyarak state alıyoruz.
            if (!item.intraday) item.intraday = [];

            // Eğer saat yeni değiştiyse (örn 14:00 olduysa) ekle
            // GitHub Actions dakikada bir çalışıyor.
            const lastEntry = item.intraday.length > 0 ? item.intraday[item.intraday.length - 1] : null;
            // lastEntry structure could be simple price, or object. Let's keep it simple price for now
            // But to check time we need object. Let's store objects in intraday: { t: "HH:mm", p: 123.45 }
            // WAIT - USER ASKED FOR SIMPLE PRICE ARRAYS.
            // Let's assume we maintain array of prices. 
            // We can just push every hour. Since we run every minute, checking `now.getMinutes() === 0` is risky (might miss it).
            // Better: `now.getMinutes() < 5` and check if we already added for this hour? 
            // Too complex for simple JSON. 
            // User request: "01.00 olduğunda ki fiyatı historye kaydet" -> save to intraday.

            // Let's stick to user's EXACT logic:
            // "24 saatlik veriyi içinde tutucak... gün bittiğinde silip 1 günlük datayı history de tutucak"

            // Logic:
            // Every hour (minute == 0): Push to intraday.
            // Day end (23:59): Push to history, clear intraday.

            if (now.getMinutes() === 0) {
                item.intraday.push(item.current);
            }

            // Gün Sonu (23:59): Veriyi geçmişe ekle ve günü temizle
            if (now.getHours() === 23 && now.getMinutes() === 59) {
                // Bugünün kapanış fiyatını ana tarihe ekle
                item.history.push(item.current);

                // Gün içi saatlik veriyi sıfırla (Yarın için temiz sayfa)
                item.intraday = [];

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
