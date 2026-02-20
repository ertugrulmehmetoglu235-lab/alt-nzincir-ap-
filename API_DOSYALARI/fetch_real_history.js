const fs = require('fs');
const https = require('https');

const FILE = './data.json';

// â”€â”€ API URLs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TRUNCGIL_URL = 'https://finans.truncgil.com/today.json';
const BINANCE_TICKER = 'https://api.binance.com/api/v3/ticker/24hr';
const GP_EMTIA = 'https://api.genelpara.com/json/?list=emtia&sembol=all';


// â”€â”€ HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function fetchJson(url) {
    return new Promise((resolve) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json,text/html,*/*'
            }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchJson(res.headers.location).then(resolve);
            }
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try {
                    if (raw.trimStart().startsWith('<')) { resolve(null); return; }
                    resolve(JSON.parse(raw));
                } catch (e) { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    });
}

// Parse Turkish number format: "35,18" or "35.018,50" â†’ float
function parseTR(val) {
    if (val == null) return NaN;
    // Strip currency symbols and whitespace
    const s = String(val).replace(/[\s$€£¥]/g, '').replace(/TL/gi, '').trim();
    if (s === '' || s === '-') return NaN;
    if (s.includes(',') && s.includes('.')) {
        // "35.018,50" format (TR thousands separator)
        return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    }
    if (s.includes(',')) {
        return parseFloat(s.replace(',', '.'));
    }
    return parseFloat(s);
}

// Append a price to the history array, keep max 1826 pts (5 years)
function appendHistory(item, price) {
    if (isNaN(price) || price <= 0) return;
    if (!Array.isArray(item.history)) item.history = [];
    item.history.push(parseFloat(price.toFixed(2)));
    if (item.history.length > 1826) {
        item.history = item.history.slice(-1826);
    }
}

function seedIfMissing(data, key, name, code, type) {
    if (!data[key]) {
        data[key] = { name, code, type, history: [], current: 0, selling: 0, buying: 0, change: 0 };
    }
}

// â”€â”€ TRUNCGIL KEY MAP (Truncgil key â†’ our key) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TRUNCGIL_MAP = {
    'gram-altin': { key: 'gram-altin', name: 'Gram AltÄ±n', code: 'GRAM', type: 'gold' },
    'ons': { key: 'ons', name: 'Ons AltÄ±n', code: 'ONS', type: 'gold' },
    'ceyrek-altin': { key: 'ceyrek-altin', name: 'Ã‡eyrek AltÄ±n', code: 'CEYREK', type: 'gold' },
    'yarim-altin': { key: 'yarim-altin', name: 'YarÄ±m AltÄ±n', code: 'YARIM', type: 'gold' },
    'tam-altin': { key: 'tam-altin', name: 'Tam AltÄ±n', code: 'TAM', type: 'gold' },
    'cumhuriyet-altini': { key: 'cumhuriyet-altini', name: 'Cumhuriyet AltÄ±nÄ±', code: 'CUMHUR', type: 'gold' },
    'ata-altin': { key: 'ata-altin', name: 'Ata AltÄ±n', code: 'ATAALT', type: 'gold' },
    'resat-altin': { key: 'resat-altin', name: 'ReÅŸat AltÄ±n', code: 'RESAT', type: 'gold' },
    'hamit-altin': { key: 'hamit-altin', name: 'Hamit AltÄ±n', code: 'HAMIT', type: 'gold' },
    'besli-altin': { key: 'besli-altin', name: 'BeÅŸli AltÄ±n', code: 'BESLI', type: 'gold' },
    'gremse-altin': { key: 'gremse-altin', name: 'Gremse AltÄ±n', code: 'GREMSE', type: 'gold' },
    'ikibucuk-altin': { key: 'ikibucuk-altin', name: 'Ä°kibuÃ§uk AltÄ±n', code: 'IKIBUC', type: 'gold' },
    'gram-has-altin': { key: 'gram-has-altin', name: 'Gram Has AltÄ±n', code: 'HAS', type: 'gold' },
    '14-ayar-altin': { key: '14-ayar-altin', name: '14 Ayar AltÄ±n', code: '14AYAR', type: 'gold' },
    '18-ayar-altin': { key: '18-ayar-altin', name: '18 Ayar AltÄ±n', code: '18AYAR', type: 'gold' },
    '22-ayar-bilezik': { key: '22-ayar-bilezik', name: '22 Ayar Bilezik', code: '22AYAR', type: 'gold' },
    'gumus': { key: 'gumus', name: 'GÃ¼mÃ¼ÅŸ', code: 'GUMUS', type: 'commodity' },
    'gram-platin': { key: 'gram-platin', name: 'Gram Platin', code: 'PLATIN', type: 'commodity' },
    'gram-paladyum': { key: 'gram-paladyum', name: 'Gram Paladyum', code: 'PALADYUM', type: 'commodity' },
};

const CURRENCY_NAMES = {
    'USD': 'ABD DolarÄ±', 'EUR': 'Euro', 'GBP': 'Ä°ngiliz Sterlini',
    'JPY': 'Japon Yeni', 'CHF': 'Ä°sviÃ§re FrangÄ±', 'CAD': 'Kanada DolarÄ±',
    'AUD': 'Avustralya DolarÄ±', 'SAR': 'Suudi Riyali', 'RUB': 'Rus Rublesi',
    'KWD': 'Kuveyt DinarÄ±', 'AZN': 'Azerbaycan ManatÄ±', 'BGN': 'Bulgar LevasÄ±',
    'NOK': 'NorveÃ§ Kronu', 'SEK': 'Ä°sveÃ§ Kronu', 'DKK': 'Danimarka Kronu',
    'DZD': 'Cezayir DinarÄ±', 'QAR': 'Katar Riyali', 'OMR': 'Umman Riyali',
    'SGD': 'Singapur DolarÄ±', 'HKD': 'Hong Kong DolarÄ±', 'MXN': 'Meksika Pesosu',
    'BRL': 'Brezilya Reali', 'ZAR': 'GÃ¼ney Afrika RandÄ±',
};

// â”€â”€ MAIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function run() {
    let data = {};
    try {
        data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        console.log(`âœ… data.json yÃ¼klendi (${Object.keys(data).length} varlÄ±k)`);
    } catch (e) {
        console.warn('âš ï¸ data.json okunamadÄ±, sÄ±fÄ±rdan baÅŸlÄ±yor:', e.message);
        data = {};
    }

    // ── A. ALTIN (Truncgil) ────────────────────────────────────────────
    console.log('\n=== A. Altın (Truncgil) ===');
    const tData = await fetchJson(TRUNCGIL_URL);
    if (tData) {
        let goldCount = 0;
        Object.entries(TRUNCGIL_MAP).forEach(([tKey, info]) => {
            const row = tData[tKey];
            if (!row) return;
            // Truncgil uses Turkish keys: 'Satış', 'Alış', 'Değişim'
            const satis = parseTR(row['Satış'] || row['Satis']);
            const alis = parseTR(row['Alış'] || row['Alis']);
            const degStr = String(row['Değişim'] || row['Degisim'] || '0').replace('%', '').trim();
            const change = parseTR(degStr);
            if (isNaN(satis) || satis <= 0) return;

            seedIfMissing(data, info.key, info.name, info.code, info.type);
            data[info.key].name = info.name;
            data[info.key].code = info.code;
            data[info.key].type = info.type;
            data[info.key].current = satis;
            data[info.key].selling = satis;
            data[info.key].buying = !isNaN(alis) && alis > 0 ? alis : satis * 0.99;
            data[info.key].change = !isNaN(change) ? change : 0;
            appendHistory(data[info.key], satis);
            goldCount++;
        });
        console.log(`Truncgil: ${goldCount} altın kaydedildi`);
    } else {
        console.warn('⚠️ Truncgil verisi alınamadı');
    }

    // ── B. DÖVİZ (Truncgil) ─────────────────────────────────────────
    console.log('\n=== B. Döviz (Truncgil) ===');
    let usdTry = data['USD']?.current || 36;
    let dvzCount = 0;
    if (tData) {
        Object.entries(tData).forEach(([sym, row]) => {
            if (!row || row['Tür'] !== 'Döviz') return;
            const satis = parseTR(row['Satış'] || row['Satis']);
            const alis = parseTR(row['Alış'] || row['Alis']);
            const degStr = String(row['Değişim'] || '0').replace('%', '').trim();
            const change = parseTR(degStr);
            if (isNaN(satis) || satis <= 0) return;
            const name = CURRENCY_NAMES[sym] || sym;
            seedIfMissing(data, sym, name, sym, 'currency');
            data[sym].name = name;
            data[sym].current = satis;
            data[sym].selling = satis;
            data[sym].buying = !isNaN(alis) && alis > 0 ? alis : satis * 0.99;
            data[sym].change = !isNaN(change) ? change : 0;
            if (sym === 'USD') usdTry = satis;
            appendHistory(data[sym], satis);
            dvzCount++;
        });
    }
    console.log(`Truncgil Döviz: ${dvzCount} döviz kaydedildi`);


    // â”€â”€ D. EMTÄ°A (GenelPara - Node.js, CORS yok) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log('\n=== D. Emtia (GenelPara) ===');
    const gpEmtiaRaw = await fetchJson(GP_EMTIA);
    const gpEmtia = gpEmtiaRaw?.data || null;
    if (gpEmtia) {
        let emtiaCount = 0;
        Object.keys(gpEmtia).forEach(sym => {
            const row = gpEmtia[sym];
            const val = parseTR(row.satis || '0');
            const change = parseTR(String(row.oran || row.degisim || '0').replace('%', ''));
            if (isNaN(val) || val <= 0) return;
            const sl = sym.toLowerCase();
            // Skip gold/silver already handled by Truncgil
            if (sl.includes('altin') || sl === 'xau' || sl === 'xag') return;
            const key = 'emtia-' + sl;
            seedIfMissing(data, key, data[key]?.name || sym, sym, 'commodity');
            data[key].current = val;
            data[key].selling = val;
            data[key].buying = val * 0.99;
            data[key].change = !isNaN(change) ? change : 0;
            appendHistory(data[key], val);
            emtiaCount++;
        });
        console.log(`GenelPara Emtia: ${emtiaCount} emtia kaydedildi`);
    } else {
        console.warn('⚠️ GenelPara Emtia verisi alınamadı');
    }

    // â”€â”€ E. KRÄ°PTO (Binance) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log('\n=== E. Kripto (Binance) ===');
    const bTicker = await fetchJson(BINANCE_TICKER);
    if (Array.isArray(bTicker)) {
        const cryptos = Object.keys(data).filter(k => data[k].type === 'crypto');
        let cryptoCount = 0;
        cryptos.forEach(key => {
            const code = data[key].code || key.toUpperCase();
            const coin = bTicker.find(c => c.symbol === code + 'USDT');
            if (!coin) return;
            const priceUSD = parseFloat(coin.lastPrice);
            const priceTRY = parseFloat((priceUSD * usdTry).toFixed(2));
            const change = parseFloat(coin.priceChangePercent);
            data[key].current = priceTRY;
            data[key].selling = priceTRY;
            data[key].change = !isNaN(change) ? change : 0;
            appendHistory(data[key], priceTRY);
            cryptoCount++;
            console.log(`${key} (${code}): $${priceUSD.toFixed(2)} â†’ â‚º${priceTRY}`);
        });
        console.log(`Binance Kripto: ${cryptoCount} kripto kaydedildi`);
    } else {
        console.warn('âš ï¸ Binance verisi alÄ±namadÄ±');
    }

    // â”€â”€ SAVE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
    const totalItems = Object.keys(data).length;
    console.log(`\nâœ… data.json kaydedildi! (${totalItems} varlÄ±k)`);
}

run().catch(err => {
    console.error('âŒ Script hatasÄ±:', err);
    process.exit(1);
});

