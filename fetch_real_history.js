const fs = require('fs');
const https = require('https');

const FILE = './data.json';

// ── API BASES ──────────────────────────────────────────
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const BINANCE_BASE = 'https://api.binance.com/api/v3/klines';

// ── CURRENCY → Yahoo Ticker map (GenelPara sembol → Yahoo) ─────
const CURRENCY_MAP = {
    'USD': 'TRY=X',
    'EUR': 'EURTRY=X',
    'GBP': 'GBPTRY=X',
    'JPY': 'JPYTRY=X',
    'CHF': 'CHFTRY=X',
    'CAD': 'CADTRY=X',
    'AUD': 'AUDTRY=X',
    'SAR': 'SARTRY=X',
    'KWD': 'KWDTRY=X',
    'AZN': 'AZNTRY=X',
    'RUB': 'RUBTRY=X'
};

// ── EMTIA → Yahoo Ticker map ───────────────────────────────────
const EMTIA_MAP = {
    'emtia-cl': { yahooSym: 'CL=F', name: 'Ham Petrol (WTI)', code: 'CL', currency: 'USD' },
    'emtia-bz': { yahooSym: 'BZ=F', name: 'Brent Petrol', code: 'BZ', currency: 'USD' },
    'emtia-ng': { yahooSym: 'NG=F', name: 'Doğalgaz', code: 'NG', currency: 'USD' },
    'emtia-si': { yahooSym: 'SI=F', name: 'Gümüş (Ons)', code: 'SI', currency: 'USD' },
    'emtia-pl': { yahooSym: 'PL=F', name: 'Platin (Ons)', code: 'PL', currency: 'USD' },
    'emtia-pa': { yahooSym: 'PA=F', name: 'Paladyum (Ons)', code: 'PA', currency: 'USD' },
    'emtia-hg': { yahooSym: 'HG=F', name: 'Bakır', code: 'HG', currency: 'USD' },
    'emtia-zw': { yahooSym: 'ZW=F', name: 'Buğday', code: 'ZW', currency: 'USD' },
    'emtia-kc': { yahooSym: 'KC=F', name: 'Kahve', code: 'KC', currency: 'USD' },
};

// ── BIST HISSE → Yahoo Ticker map (en çok takip edilen 30) ────
const HISSE_MAP = {
    'hisse-thyao': { yahooSym: 'THYAO.IS', name: 'Türk Hava Yolları', code: 'THYAO' },
    'hisse-akbnk': { yahooSym: 'AKBNK.IS', name: 'Akbank', code: 'AKBNK' },
    'hisse-garan': { yahooSym: 'GARAN.IS', name: 'Garanti BBVA', code: 'GARAN' },
    'hisse-isctr': { yahooSym: 'ISCTR.IS', name: 'İş Bankası C', code: 'ISCTR' },
    'hisse-ykbnk': { yahooSym: 'YKBNK.IS', name: 'Yapı Kredi Bankası', code: 'YKBNK' },
    'hisse-kchol': { yahooSym: 'KCHOL.IS', name: 'Koç Holding', code: 'KCHOL' },
    'hisse-sahol': { yahooSym: 'SAHOL.IS', name: 'Sabancı Holding', code: 'SAHOL' },
    'hisse-sise': { yahooSym: 'SISE.IS', name: 'Şişe Cam', code: 'SISE' },
    'hisse-eregl': { yahooSym: 'EREGL.IS', name: 'Ereğli Demir Çelik', code: 'EREGL' },
    'hisse-bimas': { yahooSym: 'BIMAS.IS', name: 'BİM Mağazaları', code: 'BIMAS' },
    'hisse-toaso': { yahooSym: 'TOASO.IS', name: 'Tofaş Oto', code: 'TOASO' },
    'hisse-froto': { yahooSym: 'FROTO.IS', name: 'Ford Otosan', code: 'FROTO' },
    'hisse-asels': { yahooSym: 'ASELS.IS', name: 'Aselsan', code: 'ASELS' },
    'hisse-tuprs': { yahooSym: 'TUPRS.IS', name: 'Tüpraş', code: 'TUPRS' },
    'hisse-arclk': { yahooSym: 'ARCLK.IS', name: 'Arçelik', code: 'ARCLK' },
    'hisse-enkai': { yahooSym: 'ENKAI.IS', name: 'Enka İnşaat', code: 'ENKAI' },
    'hisse-tkfen': { yahooSym: 'TKFEN.IS', name: 'Tekfen Holding', code: 'TKFEN' },
    'hisse-pgsus': { yahooSym: 'PGSUS.IS', name: 'Pegasus Havayolları', code: 'PGSUS' },
    'hisse-kozal': { yahooSym: 'KOZAL.IS', name: 'Koza Altın', code: 'KOZAL' },
    'hisse-alark': { yahooSym: 'ALARK.IS', name: 'Alarko Holding', code: 'ALARK' },
};

// ── HELPERS ────────────────────────────────────────────────────
function fetchJson(url) {
    const options = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
        }
    };
    return new Promise((resolve) => {
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (data.startsWith('<')) { resolve(null); return; }
                    resolve(JSON.parse(data));
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

async function getYahooHistory(symbol, range = '5y', interval = '1d') {
    const url = `${YAHOO_BASE}${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
    const data = await fetchJson(url);
    if (data && data.chart && data.chart.result && data.chart.result[0]) {
        const closes = data.chart.result[0].indicators.quote[0].close;
        return closes.filter(p => p !== null).map(p => parseFloat(p.toFixed(4)));
    }
    return [];
}

async function getBinanceHistory(symbol) {
    const url = `${BINANCE_BASE}?symbol=${symbol}USDT&interval=1d&limit=1826`;
    const data = await fetchJson(url);
    if (Array.isArray(data)) {
        return data.map(k => parseFloat(parseFloat(k[4]).toFixed(4)));
    }
    return [];
}

function scaleToTRY(usdHistory, usdTryHistory) {
    const len = Math.min(usdHistory.length, usdTryHistory.length);
    const result = [];
    for (let i = 0; i < len; i++) {
        result.push(parseFloat((usdHistory[i] * usdTryHistory[i]).toFixed(2)));
    }
    return result;
}

// ── MAIN ───────────────────────────────────────────────────────
async function run() {
    let data;
    try {
        data = JSON.parse(fs.readFileSync(FILE));
        console.log('Master Data loaded.');
    } catch (e) {
        console.error('Could not read data.json. Ensuring file exists...');
        data = {};
    }

    // ── 1. BASE RATES (USD/TRY + EUR/TRY + XAU) ──────────────
    console.log('\n=== [1/4] Temel Oranlar ===');
    const usdTryHistory = await getYahooHistory('TRY=X');
    const eurTryHistory = await getYahooHistory('EURTRY=X');
    const xauHistory = await getYahooHistory('GC=F');      // Ons altın USD
    console.log(`USD/TRY: ${usdTryHistory.length} pts | EUR/TRY: ${eurTryHistory.length} pts | XAU: ${xauHistory.length} pts`);

    // Seed & update USD/EUR
    const _seed = (key, name, code, type) => {
        if (!data[key]) data[key] = { name, code, type, history: [], current: 0, selling: 0, buying: 0, change: 0 };
    };
    _seed('USD', 'ABD Doları', 'USD', 'currency');
    _seed('EUR', 'Euro', 'EUR', 'currency');
    if (usdTryHistory.length > 0) { data['USD'].history = usdTryHistory; data['dolar'] && (data['dolar'].history = usdTryHistory); }
    if (eurTryHistory.length > 0) { data['EUR'].history = eurTryHistory; data['euro'] && (data['euro'].history = eurTryHistory); }

    // ── 2. ALTIN (Gold) ───────────────────────────────────────
    console.log('\n=== [2/4] Altın ===');
    _seed('gram-altin', 'Gram Altın', 'GRAM', 'gold');
    _seed('ons', 'Ons Altın', 'ONS', 'gold');
    data['ons'].history = xauHistory;

    // Gram altın = (XAU * USD/TRY) / 31.1035
    if (xauHistory.length > 0 && usdTryHistory.length > 0) {
        const len = Math.min(xauHistory.length, usdTryHistory.length);
        const gramHist = xauHistory.slice(-len).map((xau, i) =>
            parseFloat(((xau * usdTryHistory.slice(-len)[i]) / 31.1035).toFixed(2))
        );
        data['gram-altin'].history = gramHist;
        console.log(`Gram Altın: ${gramHist.length} pts`);
    }

    // Derived gold (çeyrek, yarım, tam etc.)
    const goldSeeds = {
        'ata-altin': { name: 'Ata Altın', code: 'ATAALT', type: 'gold', multiplier: 7.037 },
        'resat-altin': { name: 'Reşat Altın', code: 'RESAT', type: 'gold', multiplier: 7.037 },
        'hamit-altin': { name: 'Hamit Altın', code: 'HAMIT', type: 'gold', multiplier: 7.037 },
        'ceyrek-altin': { name: 'Çeyrek Altın', code: 'CEYREK', type: 'gold', multiplier: 1.702 },
        'yarim-altin': { name: 'Yarım Altın', code: 'YARIM', type: 'gold', multiplier: 3.403 },
        'tam-altin': { name: 'Tam Altın', code: 'TAM', type: 'gold', multiplier: 6.787 },
        'cumhuriyet-altini': { name: 'Cumhuriyet Altını', code: 'CUMHUR', type: 'gold', multiplier: 7.002 },
        'besli-altin': { name: 'Beşli Altın', code: 'BESLI', type: 'gold', multiplier: 34.35 },
        'gremse-altin': { name: 'Gremse Altın', code: 'GREMSE', type: 'gold', multiplier: 17.02 },
        'ikibucuk-altin': { name: 'İkibuçuk Altın', code: 'IKIBUC', type: 'gold', multiplier: 16.90 },
        'gram-has-altin': { name: 'Gram Has Altın', code: 'HAS', type: 'gold', multiplier: 0.995 },
        '14-ayar-altin': { name: '14 Ayar Altın', code: '14AYAR', type: 'gold', multiplier: 0.583 },
        '18-ayar-altin': { name: '18 Ayar Altın', code: '18AYAR', type: 'gold', multiplier: 0.750 },
        '22-ayar-bilezik': { name: '22 Ayar Bilezik', code: '22AYAR', type: 'gold', multiplier: 0.916 },
        'gram-platin': { name: 'Gram Platin', code: 'PLATIN', type: 'commodity', multiplier: 0 },
        'gram-paladyum': { name: 'Gram Paladyum', code: 'PALADYUM', type: 'commodity', multiplier: 0 },
        'gumus': { name: 'Gümüş', code: 'GUMUS', type: 'commodity', multiplier: 0 },
    };

    const gramHist = data['gram-altin']?.history || [];
    Object.entries(goldSeeds).forEach(([key, seed]) => {
        _seed(key, seed.name, seed.code, seed.type);
        if (seed.multiplier > 0 && gramHist.length > 0) {
            console.log(`Scaling ${key} ×${seed.multiplier}`);
            data[key].history = gramHist.map(v => parseFloat((v * seed.multiplier).toFixed(2)));
        }
    });

    // Platin & Paladyum from Yahoo → TRY
    const platinUsd = await getYahooHistory('PL=F');
    const paladyumUsd = await getYahooHistory('PA=F');
    const gumusUsd = await getYahooHistory('SI=F');
    if (platinUsd.length > 0) data['gram-platin'].history = scaleToTRY(platinUsd, usdTryHistory).map(v => parseFloat((v / 32.1507).toFixed(2)));
    if (paladyumUsd.length > 0) data['gram-paladyum'].history = scaleToTRY(paladyumUsd, usdTryHistory).map(v => parseFloat((v / 32.1507).toFixed(2)));
    if (gumusUsd.length > 0) data['gumus'].history = scaleToTRY(gumusUsd, usdTryHistory).map(v => parseFloat((v / 32.1507).toFixed(2)));

    // ── 3. DÖVİZ (Currency) ──────────────────────────────────
    console.log('\n=== [3/4] Döviz ===');
    for (const [key, yahooSym] of Object.entries(CURRENCY_MAP)) {
        if (key === 'USD' || key === 'EUR') continue; // Already done above
        _seed(key, key, key, 'currency');
        const hist = await getYahooHistory(yahooSym);
        if (hist.length > 0) {
            data[key].history = hist;
            console.log(`${key}: ${hist.length} pts`);
        } else {
            console.log(`${key}: No data`);
        }
    }

    // ── 4. EMTİA (Commodities) ────────────────────────────────
    console.log('\n=== [4a/4] Emtia (USD-traded, ×USD/TRY) ===');
    for (const [key, info] of Object.entries(EMTIA_MAP)) {
        _seed(key, info.name, info.code, 'commodity');
        const histUsd = await getYahooHistory(info.yahooSym);
        if (histUsd.length > 0 && usdTryHistory.length > 0) {
            // Convert USD commodity price to TRY
            const histTry = scaleToTRY(histUsd, usdTryHistory);
            data[key].history = histTry;
            console.log(`${key} (${info.yahooSym}): ${histTry.length} pts`);
        } else {
            console.log(`${key}: No data`);
        }
    }

    // ── 5. HİSSE SENETLERİ (BIST) ────────────────────────────
    console.log('\n=== [4b/4] Hisse Senetleri (BIST) ===');
    for (const [key, info] of Object.entries(HISSE_MAP)) {
        _seed(key, info.name, info.code, 'stock');
        const hist = await getYahooHistory(info.yahooSym);
        if (hist.length > 0) {
            data[key].history = hist;
            console.log(`${key} (${info.yahooSym}): ${hist.length} pts`);
        } else {
            console.log(`${key}: No data from Yahoo`);
        }
    }

    // ── 6. KRİPTO (Binance) ───────────────────────────────────
    console.log('\n=== [5/4] Kripto (Binance) ===');
    const cryptos = Object.keys(data).filter(k => data[k].type === 'crypto');
    for (const key of cryptos) {
        const symbol = data[key].code || key.toUpperCase();
        const hist = await getBinanceHistory(symbol);
        if (hist.length > 0) {
            // Binance gives USDT prices — convert to TRY using last available usdTry
            // For history we keep raw USDT prices scaled by usdTryHistory
            const finalHist = scaleToTRY(hist, usdTryHistory.slice(-hist.length).length ? usdTryHistory.slice(-hist.length) : hist.map(() => usdTryHistory[usdTryHistory.length - 1] || 35));
            data[key].history = finalHist.map(v => parseFloat(v.toFixed(2)));
            console.log(`${key} (${symbol}): ${finalHist.length} pts (TRY)`);
        }
    }

    // ── 7. SAVE ───────────────────────────────────────────────
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
    console.log('\n✅ data.json Updated Successfully!');
}

run();
