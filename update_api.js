const fs = require('fs');
const https = require('https');

// 1. Canlı veriyi çek (Truncgil)
function fetchLive() {
    return new Promise((resolve, reject) => {
        https.get('https://finans.truncgil.com/today.json', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', (err) => reject(err));
    });
}

async function update() {
    try {
        const trData = await fetchLive();
        const myData = JSON.parse(fs.readFileSync('data.json', 'utf8'));

        const now = new Date();
        const timeStr = now.toLocaleString('tr-TR');

        // GOLD (Gram bazlı, ölçekleme mobil tarafta yapılacak)
        if (trData["gram-altin"]) {
            let price = parseFloat(trData["gram-altin"].Satış.replace('.', '').replace(',', '.'));
            myData.GOLD.current = price;
            myData.GOLD.last_update = timeStr;

            // Eğer saat gece yarısı ise (00:00 - 01:00 arası), bu günü trende 'kapanış' olarak ekle
            if (now.getHours() === 0 && now.getMinutes() < 10) {
                myData.GOLD.history.push(price);
                if (myData.GOLD.history.length > 365) myData.GOLD.history.shift();
            }
        }

        // USD
        if (trData["USD"]) {
            let price = parseFloat(trData["USD"].Satış.replace(',', '.'));
            myData.USD.current = price;
            myData.USD.last_update = timeStr;
            if (now.getHours() === 0 && now.getMinutes() < 10) {
                myData.USD.history.push(price);
                if (myData.USD.history.length > 365) myData.USD.history.shift();
            }
        }

        fs.writeFileSync('data.json', JSON.stringify(myData, null, 2));
        console.log('Veriler başarıyla güncellendi:', timeStr);

    } catch (e) {
        console.error('Hata oluştu:', e);
        process.exit(1);
    }
}

update();
