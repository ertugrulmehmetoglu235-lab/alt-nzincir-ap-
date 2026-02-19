/**
 * fetch_initial_history.js
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * TEK SEFERLÄ°K tarihÃ§e yÃ¼kleme scripti.
 * Ã‡alÄ±ÅŸtÄ±r: node API_DOSYALARI/fetch_initial_history.js
 *
 * Kaynaklar:
 *   AltÄ±n       â†’ AltÄ±n.in (deneme) + Yahoo Finance (GC=F â†’ TRY) fallback
 *   DÃ¶viz       â†’ Yahoo Finance (TRY pariteleri)
 *   Kripto      â†’ Binance (klines, 5y)
 *   Hisse/Emtia â†’ Yahoo Finance (.IS ve vadeli iÅŸlem sembolleri)
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */
const fs = require('fs');
const https = require('https');

const FILE = './data.json';

// â”€â”€ API BASES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const BINANCE_BASE = 'https://api.binance.com/api/v3/klines';

// â”€â”€ HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function fetchRaw(url) {
    return new Promise((resolve) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
                'Accept': 'application/json,text/html,*/*'
            }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchRaw(res.headers.location).then(resolve);
            }
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => resolve(raw));
        });
        req.on('error', () => resolve(''));
        req.setTimeout(15000, () => { req.destroy(); resolve(''); });
    });
}

async function fetchJson(url) {
    const raw = await fetchRaw(url);
    if (!raw || raw.trimStart().startsWith('<')) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
}

async function getYahooHistory(symbol, range = '5y', interval = '1d') {
    const url = `${YAHOO_BASE}${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
    const data = await fetchJson(url);
    if (data?.chart?.result?.[0]) {
        const res = data.chart.result[0];
        const closes = res.indicators.quote[0].close;
        return (closes || []).filter(p => p != null).map(p => parseFloat(p.toFixed(4)));
    }
    return [];
}

async function getBinanceHistory(symbol, days = 1826) {
    const url = `${BINANCE_BASE}?symbol=${symbol}USDT&interval=1d&limit=${days}`;
    const data = await fetchJson(url);
    if (Array.isArray(data)) {
        return data.map(k => parseFloat(parseFloat(k[4]).toFixed(4)));
    }
    return [];
}

function scaleToTRY(prices, usdTryArr) {
    const len = Math.min(prices.length, usdTryArr.length);
    const result = [];
    for (let i = 0; i < len; i++) {
        result.push(parseFloat((prices[prices.length - len + i] * usdTryArr[usdTryArr.length - len + i]).toFixed(2)));
    }
    return result;
}

function seedIfMissing(data, key, name, code, type) {
    if (!data[key]) data[key] = { name, code, type, history: [], current: 0, selling: 0, buying: 0, change: 0 };
}

// â”€â”€ ALTIN.IN GOLD HISTORY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// AltÄ±n.in provides historical gram altÄ±n in TRY, which is more accurate than XAUâ†’TRY conversion
async function getAltinInHistory() {
    // Try various known endpoints
    const endpoints = [
        'https://data.altin.in/json/altin-fiyatlari',
        'https://altin.in/api/historical',
        'https://altin.in/json/history',
        'https://api.altin.in/historical/gram-altin'
    ];
    for (const url of endpoints) {
        console.log(`  Deneniyor: ${url}`);
        const data = await fetchJson(url);
        if (data) {
            console.log(`  âœ… AltÄ±n.in verisi alÄ±ndÄ±: ${url}`);
            return data;
        }
    }
    // Try HTML page and look for embedded JSON
    const html = await fetchRaw('https://altin.in');
    if (html) {
        // Look for JSON data embedded in script tags
        const match = html.match(/gramAltin['":\s]+(\[[\d.,\s]+\])/);
        if (match) {
            try {
                const arr = JSON.parse(match[1]);
                console.log(`  âœ… AltÄ±n.in HTML'den ${arr.length} veri noktasÄ± alÄ±ndÄ±`);
                return { type: 'raw_array', data: arr };
            } catch (e) { }
        }
    }
    console.log('  âš ï¸ AltÄ±n.in eriÅŸilemedi, Yahoo Finance fallback kullanÄ±lÄ±yor');
    return null;
}

// â”€â”€ CURRENCY MAP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CURRENCY_MAP = {
    'USD': { yahoo: 'TRY=X', name: 'ABD DolarÄ±', code: 'USD' },
    'EUR': { yahoo: 'EURTRY=X', name: 'Euro', code: 'EUR' },
    'GBP': { yahoo: 'GBPTRY=X', name: 'Ä°ngiliz Sterlini', code: 'GBP' },
    'JPY': { yahoo: 'JPYTRY=X', name: 'Japon Yeni', code: 'JPY' },
    'CHF': { yahoo: 'CHFTRY=X', name: 'Ä°sviÃ§re FrangÄ±', code: 'CHF' },
    'CAD': { yahoo: 'CADTRY=X', name: 'Kanada DolarÄ±', code: 'CAD' },
    'AUD': { yahoo: 'AUDTRY=X', name: 'Avustralya DolarÄ±', code: 'AUD' },
    'NOK': { yahoo: 'NOKTRY=X', name: 'NorveÃ§ Kronu', code: 'NOK' },
    'SEK': { yahoo: 'SEKTRY=X', name: 'Ä°sveÃ§ Kronu', code: 'SEK' },
    'SAR': { yahoo: 'SARTRY=X', name: 'Suudi Riyali', code: 'SAR' },
    'RUB': { yahoo: 'RUBTRY=X', name: 'Rus Rublesi', code: 'RUB' },
    'DKK': { yahoo: 'DKKTRY=X', name: 'Danimarka Kronu', code: 'DKK' },
};

// â”€â”€ BIST HISSE MAP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const HISSE_MAP = {
    'hisse-thyao': { yahoo: 'THYAO.IS', name: 'TÃ¼rk Hava YollarÄ±', code: 'THYAO' },
    'hisse-akbnk': { yahoo: 'AKBNK.IS', name: 'Akbank', code: 'AKBNK' },
    'hisse-garan': { yahoo: 'GARAN.IS', name: 'Garanti BBVA', code: 'GARAN' },
    'hisse-isctr': { yahoo: 'ISCTR.IS', name: 'Ä°ÅŸ BankasÄ± C', code: 'ISCTR' },
    'hisse-ykbnk': { yahoo: 'YKBNK.IS', name: 'YapÄ± Kredi', code: 'YKBNK' },
    'hisse-kchol': { yahoo: 'KCHOL.IS', name: 'KoÃ§ Holding', code: 'KCHOL' },
    'hisse-sahol': { yahoo: 'SAHOL.IS', name: 'SabancÄ± Holding', code: 'SAHOL' },
    'hisse-sise': { yahoo: 'SISE.IS', name: 'ÅiÅŸe Cam', code: 'SISE' },
    'hisse-eregl': { yahoo: 'EREGL.IS', name: 'EreÄŸli Demir Ã‡elik', code: 'EREGL' },
    'hisse-bimas': { yahoo: 'BIMAS.IS', name: 'BÄ°M MaÄŸazalarÄ±', code: 'BIMAS' },
    'hisse-toaso': { yahoo: 'TOASO.IS', name: 'TofaÅŸ Oto', code: 'TOASO' },
    'hisse-froto': { yahoo: 'FROTO.IS', name: 'Ford Otosan', code: 'FROTO' },
    'hisse-asels': { yahoo: 'ASELS.IS', name: 'Aselsan', code: 'ASELS' },
    'hisse-tuprs': { yahoo: 'TUPRS.IS', name: 'TÃ¼praÅŸ', code: 'TUPRS' },
    'hisse-arclk': { yahoo: 'ARCLK.IS', name: 'ArÃ§elik', code: 'ARCLK' },
    'hisse-pgsus': { yahoo: 'PGSUS.IS', name: 'Pegasus HavayollarÄ±', code: 'PGSUS' },
    'hisse-kozal': { yahoo: 'KOZAL.IS', name: 'Koza AltÄ±n', code: 'KOZAL' },
    'hisse-enkai': { yahoo: 'ENKAI.IS', name: 'Enka Ä°nÅŸaat', code: 'ENKAI' },
    'hisse-tkfen': { yahoo: 'TKFEN.IS', name: 'Tekfen Holding', code: 'TKFEN' },
    'hisse-alark': { yahoo: 'ALARK.IS', name: 'Alarko Holding', code: 'ALARK' },
};

// â”€â”€ EMTIA MAP (USD traded) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const EMTIA_MAP = {
    'emtia-cl': { yahoo: 'CL=F', name: 'Ham Petrol (WTI)', code: 'CL' },
    'emtia-bz': { yahoo: 'BZ=F', name: 'Brent Petrol', code: 'BZ' },
    'emtia-ng': { yahoo: 'NG=F', name: 'DoÄŸalgaz', code: 'NG' },
    'emtia-hg': { yahoo: 'HG=F', name: 'BakÄ±r', code: 'HG' },
    'emtia-zw': { yahoo: 'ZW=F', name: 'BuÄŸday', code: 'ZW' },
    'emtia-kc': { yahoo: 'KC=F', name: 'Kahve', code: 'KC' },
    'emtia-co': { yahoo: 'CC=F', name: 'Kakao', code: 'CO' },
};

// â”€â”€ KRIPTO LIST â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CRYPTO_LIST = [
    { key: 'btc', name: 'Bitcoin', code: 'BTC' },
    { key: 'eth', name: 'Ethereum', code: 'ETH' },
    { key: 'sol', name: 'Solana', code: 'SOL' },
    { key: 'bnb', name: 'BNB', code: 'BNB' },
    { key: 'xrp', name: 'XRP', code: 'XRP' },
    { key: 'avax', name: 'Avalanche', code: 'AVAX' },
    { key: 'ada', name: 'Cardano', code: 'ADA' },
    { key: 'dot', name: 'Polkadot', code: 'DOT' },
    { key: 'link', name: 'Chainlink', code: 'LINK' },
    { key: 'ltc', name: 'Litecoin', code: 'LTC' },
];

// â”€â”€ MAIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function run() {
    let data = {};
    try {
        data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        console.log(`âœ… Mevcut data.json yÃ¼klendi (${Object.keys(data).length} varlÄ±k)\n`);
    } catch (e) {
        console.log('data.json bulunamadÄ±, yeniden oluÅŸturuluyor...\n');
        data = {};
    }

    // â”€â”€ 1. BASE: USD/TRY for scaling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log('=== [1] USD/TRY TarihÃ§esi ===');
    const usdTryHistory = await getYahooHistory('TRY=X');
    const lastUsdTry = usdTryHistory[usdTryHistory.length - 1] || 36;
    console.log(`USD/TRY: ${usdTryHistory.length} veri noktasÄ± | Son: ${lastUsdTry}`);

    // â”€â”€ 2. ALTIN (AltÄ±n.in â†’ fallback Yahoo Finance) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log('\n=== [2] AltÄ±n TarihÃ§esi ===');
    console.log('AltÄ±n.in deneniyor...');
    const altinInData = await getAltinInHistory();
    let gramAltinHistory = [];

    if (altinInData) {
        // Parse AltÄ±n.in response (structure depends on their API)
        if (altinInData.type === 'raw_array') {
            gramAltinHistory = altinInData.data;
        } else if (Array.isArray(altinInData)) {
            gramAltinHistory = altinInData.map(d => typeof d === 'object' ? (d.price || d.kapanis || d.value) : d).filter(Boolean);
        } else if (altinInData.data) {
            gramAltinHistory = Array.isArray(altinInData.data) ? altinInData.data : [];
        }
    }

    // Fallback: Yahoo Finance GC=F Ã— USD/TRY / 31.1035
    if (gramAltinHistory.length < 100) {
        console.log('AltÄ±n.in yeterli veri yok, Yahoo Finance kullanÄ±lÄ±yor...');
        const xauHistory = await getYahooHistory('GC=F');
        if (xauHistory.length > 0 && usdTryHistory.length > 0) {
            const len = Math.min(xauHistory.length, usdTryHistory.length);
            gramAltinHistory = xauHistory.slice(-len).map((xau, i) =>
                parseFloat(((xau * usdTryHistory.slice(-len)[i]) / 31.1035).toFixed(2))
            );
            console.log(`Yahoo GC=F: ${gramAltinHistory.length} veri noktasÄ±`);
        }
    }

    // Seed gold items
    const goldSeeds = {
        'gram-altin': { name: 'Gram AltÄ±n', code: 'GRAM', multiplier: 1.000 },
        'ons': { name: 'Ons AltÄ±n', code: 'ONS', multiplier: 31.1035, usd: true },
        'ceyrek-altin': { name: 'Ã‡eyrek AltÄ±n', code: 'CEYREK', multiplier: 1.702 },
        'yarim-altin': { name: 'YarÄ±m AltÄ±n', code: 'YARIM', multiplier: 3.403 },
        'tam-altin': { name: 'Tam AltÄ±n', code: 'TAM', multiplier: 6.787 },
        'cumhuriyet-altini': { name: 'Cumhuriyet AltÄ±nÄ±', code: 'CUMHUR', multiplier: 7.002 },
        'ata-altin': { name: 'Ata AltÄ±n', code: 'ATAALT', multiplier: 7.037 },
        'resat-altin': { name: 'ReÅŸat AltÄ±n', code: 'RESAT', multiplier: 7.037 },
        'hamit-altin': { name: 'Hamit AltÄ±n', code: 'HAMIT', multiplier: 7.037 },
        'besli-altin': { name: 'BeÅŸli AltÄ±n', code: 'BESLI', multiplier: 34.35 },
        'gremse-altin': { name: 'Gremse AltÄ±n', code: 'GREMSE', multiplier: 17.02 },
        'ikibucuk-altin': { name: 'Ä°kibuÃ§uk AltÄ±n', code: 'IKIBUC', multiplier: 16.90 },
        'gram-has-altin': { name: 'Gram Has AltÄ±n', code: 'HAS', multiplier: 0.995 },
        '14-ayar-altin': { name: '14 Ayar AltÄ±n', code: '14AYAR', multiplier: 0.583 },
        '18-ayar-altin': { name: '18 Ayar AltÄ±n', code: '18AYAR', multiplier: 0.750 },
        '22-ayar-bilezik': { name: '22 Ayar Bilezik', code: '22AYAR', multiplier: 0.916 },
    };

    Object.entries(goldSeeds).forEach(([key, seed]) => {
        seedIfMissing(data, key, seed.name, seed.code, 'gold');
        if (gramAltinHistory.length > 0) {
            data[key].history = gramAltinHistory.map(g => parseFloat((g * seed.multiplier).toFixed(2)));
            const last = data[key].history[data[key].history.length - 1];
            data[key].current = last; data[key].selling = last;
        }
        console.log(`  ${key}: ${data[key].history.length} veri noktasÄ±`);
    });

    // GÃ¼mÃ¼ÅŸ ve platin ayrÄ± Yahoo'dan
    const gumusUsd = await getYahooHistory('SI=F');
    const platinUsd = await getYahooHistory('PL=F');
    ['gumus', 'gram-platin', 'gram-paladyum'].forEach(k => seedIfMissing(data, k, k, k.toUpperCase(), 'commodity'));
    if (gumusUsd.length > 0) {
        data['gumus'].history = scaleToTRY(gumusUsd, usdTryHistory).map(v => parseFloat((v / 32.1507).toFixed(2)));
        console.log(`  gumus: ${data['gumus'].history.length} veri noktasÄ±`);
    }
    if (platinUsd.length > 0) {
        data['gram-platin'].history = scaleToTRY(platinUsd, usdTryHistory).map(v => parseFloat((v / 32.1507).toFixed(2)));
        console.log(`  gram-platin: ${data['gram-platin'].history.length} veri noktasÄ±`);
    }

    // â”€â”€ 3. DÃ–VÄ°Z (Yahoo Finance) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log('\n=== [3] DÃ¶viz TarihÃ§esi (Yahoo Finance) ===');
    for (const [sym, info] of Object.entries(CURRENCY_MAP)) {
        seedIfMissing(data, sym, info.name, info.code, 'currency');
        const hist = await getYahooHistory(info.yahoo);
        if (hist.length > 0) {
            data[sym].history = hist;
            const last = hist[hist.length - 1];
            data[sym].current = last; data[sym].selling = last;
            if (sym === 'USD') { /* usdTry already set */ }
            console.log(`  ${sym}: ${hist.length} veri noktasÄ± | Son: ${last}`);
        } else {
            console.log(`  ${sym}: âš ï¸ Veri alÄ±namadÄ±`);
        }
    }

    // â”€â”€ 4. HÄ°SSE (Yahoo Finance .IS) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log('\n=== [4] Hisse TarihÃ§esi (Yahoo Finance) ===');
    for (const [key, info] of Object.entries(HISSE_MAP)) {
        seedIfMissing(data, key, info.name, info.code, 'stock');
        const hist = await getYahooHistory(info.yahoo);
        if (hist.length > 0) {
            data[key].history = hist;
            const last = hist[hist.length - 1];
            data[key].current = last; data[key].selling = last; data[key].buying = last;
            console.log(`  ${key}: ${hist.length} veri noktasÄ± | Son: ${last}`);
        } else {
            console.log(`  ${key}: âš ï¸ Veri alÄ±namadÄ±`);
        }
    }

    // â”€â”€ 5. EMTÄ°A (Yahoo Finance, USD â†’ TRY) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log('\n=== [5] Emtia TarihÃ§esi (Yahoo Finance) ===');
    for (const [key, info] of Object.entries(EMTIA_MAP)) {
        seedIfMissing(data, key, info.name, info.code, 'commodity');
        const histUsd = await getYahooHistory(info.yahoo);
        if (histUsd.length > 0) {
            const histTry = scaleToTRY(histUsd, usdTryHistory);
            data[key].history = histTry;
            const last = histTry[histTry.length - 1];
            data[key].current = last; data[key].selling = last;
            console.log(`  ${key}: ${histTry.length} veri noktasÄ± | Son: â‚º${last}`);
        } else {
            console.log(`  ${key}: âš ï¸ Veri alÄ±namadÄ±`);
        }
    }

    // â”€â”€ 6. KRÄ°PTO (Binance klines) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log('\n=== [6] Kripto TarihÃ§esi (Binance) ===');
    for (const crypto of CRYPTO_LIST) {
        const key = crypto.key;
        seedIfMissing(data, key, crypto.name, crypto.code, 'crypto');
        const histUsdt = await getBinanceHistory(crypto.code);
        if (histUsdt.length > 0) {
            const histTry = scaleToTRY(histUsdt, usdTryHistory);
            data[key].history = histTry.map(v => parseFloat(v.toFixed(2)));
            const last = data[key].history[data[key].history.length - 1];
            data[key].current = last; data[key].selling = last;
            console.log(`  ${key}: ${histTry.length} veri noktasÄ± | Son: â‚º${last}`);
        } else {
            console.log(`  ${key}: âš ï¸ Veri alÄ±namadÄ±`);
        }
    }

    // â”€â”€ SAVE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log(`\nâœ… TAMAMLANDI! data.json kaydedildi (${Object.keys(data).length} varlÄ±k)`);
    console.log('ArtÄ±k gÃ¼nlÃ¼k gÃ¼ncellemeler iÃ§in fetch_real_history.js Ã§alÄ±ÅŸacak.');
}

run().catch(err => {
    console.error('âŒ Script hatasÄ±:', err);
    process.exit(1);
});

