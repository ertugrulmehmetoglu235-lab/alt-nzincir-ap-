const fs = require('fs');
const https = require('https');

const FILE = 'API_DOSYALARI/data.json';

// ── API URLs ─────────────────────────────────────────────────────
const TRUNCGIL_URL   = 'https://finans.truncgil.com/today.json';
const BINANCE_TICKER = 'https://api.binance.com/api/v3/ticker/24hr';
const GP_DOVIZ       = 'https://api.genelpara.com/json/?list=doviz&sembol=all';
const GP_HISSE       = 'https://api.genelpara.com/json/?list=hisse&sembol=all';
const GP_EMTIA       = 'https://api.genelpara.com/json/?list=emtia&sembol=all';

// ── HELPERS ──────────────────────────────────────────────────────
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

// Parse Turkish number format: "35,18" or "35.018,50" → float
function parseTR(val) {
    if (val == null) return NaN;
    const s = String(val).replace(/\s/g, '');
    if (s.includes(',') && s.includes('.')) {
        // "35.018,50" format
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

// ── TRUNCGIL KEY MAP (Truncgil key → our key) ────────────────────
const TRUNCGIL_MAP = {
    'gram-altin':       { key: 'gram-altin',       name: 'Gram Altın',        code: 'GRAM',    type: 'gold' },
    'ons':              { key: 'ons',               name: 'Ons Altın',         code: 'ONS',     type: 'gold' },
    'ceyrek-altin':     { key: 'ceyrek-altin',      name: 'Çeyrek Altın',      code: 'CEYREK',  type: 'gold' },
    'yarim-altin':      { key: 'yarim-altin',       name: 'Yarım Altın',       code: 'YARIM',   type: 'gold' },
    'tam-altin':        { key: 'tam-altin',         name: 'Tam Altın',         code: 'TAM',     type: 'gold' },
    'cumhuriyet-altini':{ key: 'cumhuriyet-altini', name: 'Cumhuriyet Altını', code: 'CUMHUR',  type: 'gold' },
    'ata-altin':        { key: 'ata-altin',         name: 'Ata Altın',         code: 'ATAALT',  type: 'gold' },
    'resat-altin':      { key: 'resat-altin',       name: 'Reşat Altın',       code: 'RESAT',   type: 'gold' },
    'hamit-altin':      { key: 'hamit-altin',       name: 'Hamit Altın',       code: 'HAMIT',   type: 'gold' },
    'besli-altin':      { key: 'besli-altin',       name: 'Beşli Altın',       code: 'BESLI',   type: 'gold' },
    'gremse-altin':     { key: 'gremse-altin',      name: 'Gremse Altın',      code: 'GREMSE',  type: 'gold' },
    'ikibucuk-altin':   { key: 'ikibucuk-altin',    name: 'İkibuçuk Altın',    code: 'IKIBUC',  type: 'gold' },
    'gram-has-altin':   { key: 'gram-has-altin',    name: 'Gram Has Altın',    code: 'HAS',     type: 'gold' },
    '14-ayar-altin':    { key: '14-ayar-altin',     name: '14 Ayar Altın',     code: '14AYAR',  type: 'gold' },
    '18-ayar-altin':    { key: '18-ayar-altin',     name: '18 Ayar Altın',     code: '18AYAR',  type: 'gold' },
    '22-ayar-bilezik':  { key: '22-ayar-bilezik',   name: '22 Ayar Bilezik',   code: '22AYAR',  type: 'gold' },
    'gumus':            { key: 'gumus',              name: 'Gümüş',             code: 'GUMUS',   type: 'commodity' },
    'gram-platin':      { key: 'gram-platin',        name: 'Gram Platin',       code: 'PLATIN',  type: 'commodity' },
    'gram-paladyum':    { key: 'gram-paladyum',      name: 'Gram Paladyum',     code: 'PALADYUM',type: 'commodity' },
};

const CURRENCY_NAMES = {
    'USD': 'ABD Doları',     'EUR': 'Euro',            'GBP': 'İngiliz Sterlini',
    'JPY': 'Japon Yeni',     'CHF': 'İsviçre Frangı',  'CAD': 'Kanada Doları',
    'AUD': 'Avustralya Doları','SAR': 'Suudi Riyali',  'RUB': 'Rus Rublesi',
    'KWD': 'Kuveyt Dinarı',  'AZN': 'Azerbaycan Manatı','BGN':'Bulgar Levası',
    'NOK': 'Norveç Kronu',   'SEK': 'İsveç Kronu',     'DKK': 'Danimarka Kronu',
    'DZD': 'Cezayir Dinarı', 'QAR': 'Katar Riyali',   'OMR': 'Umman Riyali',
    'SGD': 'Singapur Doları', 'HKD': 'Hong Kong Doları','MXN': 'Meksika Pesosu',
    'BRL': 'Brezilya Reali', 'ZAR': 'Güney Afrika Randı',
};

// ── MAIN ─────────────────────────────────────────────────────────
async function run() {
    let data = {};
    try {
        data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        console.log(`✅ data.json yüklendi (${Object.keys(data).length} varlık)`);
    } catch (e) {
        console.warn('⚠️ data.json okunamadı, sıfırdan başlıyor:', e.message);
        data = {};
    }

    // ── A. ALTIN (Truncgil) ──────────────────────────────────────
    console.log('\n=== A. Altın (Truncgil) ===');
    const tData = await fetchJson(TRUNCGIL_URL);
    if (tData) {
        let goldCount = 0;
        Object.entries(TRUNCGIL_MAP).forEach(([tKey, info]) => {
            const row = tData[tKey];
            if (!row) return;
            const satisKey = Object.keys(row).find(k => k.toLowerCase().includes('sat') || k.toLowerCase() === 'satis');
            const alisKey  = Object.keys(row).find(k => k.toLowerCase() === 'alış' || k.toLowerCase() === 'alis');
            const degKey   = Object.keys(row).find(k => k.toLowerCase().includes('değ') || k.toLowerCase().includes('deg'));
            const satis  = parseTR(satisKey ? row[satisKey] : row['Satis']);
            const alis   = parseTR(alisKey  ? row[alisKey]  : row['Alis']);
            const change = parseTR(String(degKey ? row[degKey] : 0).replace('%', ''));
            if (isNaN(satis) || satis <= 0) return;

            seedIfMissing(data, info.key, info.name, info.code, info.type);
            data[info.key].name    = info.name;
            data[info.key].code    = info.code;
            data[info.key].type    = info.type;
            data[info.key].current = satis;
            data[info.key].selling = satis;
            data[info.key].buying  = !isNaN(alis) && alis > 0 ? alis : satis * 0.99;
            data[info.key].change  = !isNaN(change) ? change : 0;
            appendHistory(data[info.key], satis);
            goldCount++;
        });
        console.log(`Truncgil: ${goldCount} altın kaydedildi`);
    } else {
        console.warn('⚠️ Truncgil verisi alınamadı');
    }

    // ── B. DÖVİZ (GenelPara - Node.js, CORS yok) ─────────────────
    console.log('\n=== B. Döviz (GenelPara) ===');
    const gpDoviz = await fetchJson(GP_DOVIZ);
    let usdTry = data['USD']?.current || 36;
    if (gpDoviz) {
        let dvzCount = 0;
        Object.keys(gpDoviz).forEach(sym => {
            const row  = gpDoviz[sym];
            const satis  = parseTR(row.satis);
            const alis   = parseTR(row.alis);
            const change = parseTR(String(row.yuzde || '0').replace('%', ''));
            if (isNaN(satis) || satis <= 0) return;
            const name = CURRENCY_NAMES[sym] || sym;
            seedIfMissing(data, sym, name, sym, 'currency');
            data[sym].name    = name;
            data[sym].current = satis;
            data[sym].selling = satis;
            data[sym].buying  = !isNaN(alis) && alis > 0 ? alis : satis * 0.99;
            data[sym].change  = !isNaN(change) ? change : 0;
            if (sym === 'USD') usdTry = satis;
            appendHistory(data[sym], satis);
            dvzCount++;
        });
        console.log(`GenelPara Döviz: ${dvzCount} döviz kaydedildi`);
    } else {
        console.warn('⚠️ GenelPara Döviz verisi alınamadı');
    }

    // ── C. HİSSE (GenelPara - Node.js, CORS yok) ─────────────────
    console.log('\n=== C. Hisse (GenelPara) ===');
    const gpHisse = await fetchJson(GP_HISSE);
    if (gpHisse) {
        let hisseCount = 0;
        Object.keys(gpHisse).forEach(sym => {
            const row   = gpHisse[sym];
            const val   = parseTR(row.satis || row.son || row.kapanis || '0');
            const change= parseTR(String(row.yuzde || '0').replace('%', ''));
            if (isNaN(val) || val <= 0) return;
            const key = 'hisse-' + sym.toLowerCase();
            seedIfMissing(data, key, data[key]?.name || sym, sym, 'stock');
            data[key].current = val;
            data[key].selling = val;
            data[key].buying  = val;
            data[key].change  = !isNaN(change) ? change : 0;
            appendHistory(data[key], val);
            hisseCount++;
        });
        console.log(`GenelPara Hisse: ${hisseCount} hisse kaydedildi`);
    } else {
        console.warn('⚠️ GenelPara Hisse verisi alınamadı');
    }

    // ── D. EMTİA (GenelPara - Node.js, CORS yok) ─────────────────
    console.log('\n=== D. Emtia (GenelPara) ===');
    const gpEmtia = await fetchJson(GP_EMTIA);
    if (gpEmtia) {
        let emtiaCount = 0;
        Object.keys(gpEmtia).forEach(sym => {
            const row  = gpEmtia[sym];
            const val  = parseTR(row.satis || '0');
            const change = parseTR(String(row.yuzde || '0').replace('%', ''));
            if (isNaN(val) || val <= 0) return;
            const sl  = sym.toLowerCase();
            // Skip gold/silver already handled by Truncgil
            if (sl.includes('altin') || sl === 'xau' || sl === 'xag') return;
            const key = 'emtia-' + sl;
            seedIfMissing(data, key, data[key]?.name || sym, sym, 'commodity');
            data[key].current = val;
            data[key].selling = val;
            data[key].buying  = val * 0.99;
            data[key].change  = !isNaN(change) ? change : 0;
            appendHistory(data[key], val);
            emtiaCount++;
        });
        console.log(`GenelPara Emtia: ${emtiaCount} emtia kaydedildi`);
    } else {
        console.warn('⚠️ GenelPara Emtia verisi alınamadı');
    }

    // ── E. KRİPTO (Binance) ───────────────────────────────────────
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
            const change   = parseFloat(coin.priceChangePercent);
            data[key].current = priceTRY;
            data[key].selling = priceTRY;
            data[key].change  = !isNaN(change) ? change : 0;
            appendHistory(data[key], priceTRY);
            cryptoCount++;
            console.log(`${key} (${code}): $${priceUSD.toFixed(2)} → ₺${priceTRY}`);
        });
        console.log(`Binance Kripto: ${cryptoCount} kripto kaydedildi`);
    } else {
        console.warn('⚠️ Binance verisi alınamadı');
    }

    // ── SAVE ─────────────────────────────────────────────────────
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
    const totalItems = Object.keys(data).length;
    console.log(`\n✅ data.json kaydedildi! (${totalItems} varlık)`);
}

run().catch(err => {
    console.error('❌ Script hatası:', err);
    process.exit(1);
});
