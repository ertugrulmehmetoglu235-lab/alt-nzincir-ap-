const fs = require('fs');
const https = require('https');

function fetchJSON(url) {
    return new Promise((resolve) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'application/json'
            }
        };
        https.get(url, options, (res) => {
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
    // Remove all currency symbols ($ € ₺ etc) and spaces, keep only numbers, dots and commas
    const cleanStr = str.toString().replace(/[^0-9,.]/g, '');

    if (type === 'gold' || type?.includes('altin') || type === 'gold-ons') {
        return parseFloat(cleanStr.replace(/\./g, '').replace(',', '.'));
    }
    return parseFloat(cleanStr.replace(',', '.'));
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
        const timeStr = now.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

        // Timezone adjustment for logic checks (Get Istanbul Hour)
        const istanbulDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
        const currentHour = istanbulDate.getHours();
        const currentDay = istanbulDate.getDate();

        // 1. TRUNCGIL API (Altın ve Döviz)
        const trData = await fetchJSON('https://finans.truncgil.com/today.json') || {};

        // 2. BINANCE API (Kripto) - Daha Kararlı Kaynak
        // ticker/24hr endpoint'i hem fiyat hem değişim oranı verir
        const binanceData = await fetchJSON('https://api.binance.com/api/v3/ticker/24hr') || [];
        const cryptoMap = {};
        if (Array.isArray(binanceData)) {
            console.log('✅ Binance Data Received:', binanceData.length, 'pairs');
            binanceData.forEach(c => {
                // Sadece USDT çiftlerini al (BTCUSDT -> BTC)
                if (c.symbol.endsWith('USDT')) {
                    const clean = c.symbol.replace('USDT', '');
                    cryptoMap[clean] = {
                        price: parseFloat(c.lastPrice),
                        change: parseFloat(c.priceChangePercent)
                    };
                }
            });
            // Hata ayıklama: Örnek bir veri göster
            if (cryptoMap['BTC']) console.log('Sample Coin (BTC):', cryptoMap['BTC']);
        } else {
            console.error('❌ Binance Data Failed/Empty');
        }

        const USDTRY = (trData['USD'] && trData['USD'].Satış) ? parsePrice(trData['USD'].Satış, 'currency') : 35;
        console.log('💵 USDTRY:', USDTRY);

        // Tüm varlıkları döngüye al
        Object.keys(myData).forEach(key => {
            const item = myData[key];
            const oldDate = parseDate(item.last_update);

            // Eğer daha önce hiç güncellenmediyse, şu anı kabul et
            const lastHour = oldDate ? oldDate.getHours() : -1;
            const lastDay = oldDate ? oldDate.getDate() : -1;

            // FİYAT ve DEĞİŞİM GÜNCELLEME

            // 1. Truncgil (Altın, Döviz)
            if (trData[key]) {
                const livePrice = parsePrice(trData[key].Satış, item.type);
                if (livePrice > 0) item.current = livePrice;

                // Değişim Oranı (%1,5 -> 1.5)
                if (trData[key].Değişim) {
                    item.change = parseFloat(trData[key].Değişim.replace('%', '').replace(',', '.'));
                }
            }
            // 2. Binance (Kripto)
            else if (item.type === 'crypto' && cryptoMap[item.code]) {
                item.current = parseFloat((cryptoMap[item.code].price * USDTRY).toFixed(2));
                item.change = cryptoMap[item.code].change;
            }
            // 3. ONS Fix
            else if (key === 'ons' && trData['ons']) {
                const livePrice = parsePrice(trData['ons'].Satış, item.type);
                if (livePrice > 0) item.current = livePrice;
                if (trData['ons'].Değişim) {
                    item.change = parseFloat(trData['ons'].Değişim.replace('%', '').replace(',', '.'));
                }
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
