const fs = require('fs');
const https = require('https');

const FILE = 'API_DOSYALARI/data.json';

// Yahoo Finance Chart API (Public)
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const BINANCE_BASE = 'https://api.binance.com/api/v3/klines';
const DATASHOP_URL = ''; // ⚠️ BURAYA DATASHOP REST API LINKINI YAZIN (Varsa)

// Helper: Fetch JSON with Headers
function fetchJson(url) {
    const options = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
        }
    };
    return new Promise((resolve, reject) => {
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    // Check for standard Yahoo error HTML
                    if (data.startsWith('<')) {
                        console.error("Received HTML instead of JSON from " + url);
                        resolve(null);
                    } else {
                        resolve(JSON.parse(data));
                    }
                } catch (e) {
                    console.error("JSON Parse Error for URL:", url);
                    resolve(null);
                }
            });
        }).on('error', reject);
    });
}

async function getYahooHistory(symbol) {
    const url = `${YAHOO_BASE}${symbol}?range=5y&interval=1d`;
    console.log(`Fetching Yahoo: ${symbol}...`);
    const data = await fetchJson(url);

    if (data && data.chart && data.chart.result && data.chart.result[0]) {
        const quote = data.chart.result[0].indicators.quote[0].close;
        // Filter nulls and format
        return quote.filter(p => p !== null).map(p => parseFloat(p.toFixed(2)));
    }
    return [];
}

async function getBinanceHistory(symbol) {
    // 1d interval, limit 5 years (approx 1826 days)
    const url = `${BINANCE_BASE}?symbol=${symbol}USDT&interval=1d&limit=1826`;
    console.log(`Fetching Binance: ${symbol}...`);
    const data = await fetchJson(url);

    if (Array.isArray(data)) {
        return data.map(k => parseFloat(k[4]));
    }
    return [];
}

async function run() {
    // 1. Read Master File
    let data;
    try {
        data = JSON.parse(fs.readFileSync(FILE));
        console.log("Master Data loaded.");
    } catch (e) {
        console.error("Could not read data.json. Ensure it exists.");
        return;
    }

    // 2. Fetch Base Assets (USD, XAU)
    const usdHistory = await getYahooHistory('TRY=X'); // USD/TRY
    const eurHistory = await getYahooHistory('EURTRY=X'); // EUR/TRY
    const xauHistory = await getYahooHistory('GC=F'); // ONS GOLD (USD)

    // 3. Update Market Data
    // Ensure aliases exist
    if (data['dolar'] && !data['USD']) data['USD'] = data['dolar'];
    if (data['USD'] && !data['dolar']) data['dolar'] = data['USD'];

    // Update Base Currencies
    if (data['USD']) data['USD'].history = usdHistory;
    if (data['dolar']) data['dolar'].history = usdHistory;
    if (data['EUR']) data['EUR'].history = eurHistory;
    if (data['euro']) data['euro'].history = eurHistory;

    // 2.5 AUTO-SEED MISSING GOLD ITEMS
    // These items exist in Truncgil API but may be missing from data.json
    const goldSeeds = {
        'ata-altin': { name: 'Ata Altın', code: 'ATA', type: 'gold', multiplier: 7.15 },
        'resat-altin': { name: 'Reşat Altın', code: 'RESAT', type: 'gold', multiplier: 7.10 },
        'hamit-altin': { name: 'Hamit Altın', code: 'HAMIT', type: 'gold', multiplier: 7.10 },
        'besli-altin': { name: 'Beşli Altın', code: 'BESLI', type: 'gold', multiplier: 32.70 },
        'gremse-altin': { name: 'Gremse Altın', code: 'GREMSE', type: 'gold', multiplier: 16.35 },
        'gram-has-altin': { name: 'Gram Has Altın', code: 'HAS', type: 'gold', multiplier: 0.995 },
        'gram-platin': { name: 'Gram Platin', code: 'PLATIN', type: 'commodity', multiplier: 0 },
        'gram-paladyum': { name: 'Gram Paladyum', code: 'PALADYUM', type: 'commodity', multiplier: 0 },
        'gumus': { name: 'Gümüş', code: 'GUMUS', type: 'commodity', multiplier: 0 }
    };

    Object.entries(goldSeeds).forEach(([key, seed]) => {
        if (!data[key]) {
            console.log(`🌱 Seeding missing item: ${key}`);
            data[key] = { name: seed.name, code: seed.code, type: seed.type, history: [], current: 0, selling: 0, buying: 0, change: 0 };
        }
    });

    // 3. Iterate All Items
    Object.keys(data).forEach(key => {
        const item = data[key];

        // GRAM ALTIN
        if (key === 'gram-altin' || key === 'GRAM') {
            // Formula: Gram TL = (Ons USD * USD/TL) / 31.1035
            if (xauHistory.length > 0 && usdHistory.length > 0) {
                const len = Math.min(xauHistory.length, usdHistory.length);
                const gramHist = [];
                const xau = xauHistory.slice(-len);
                const usd = usdHistory.slice(-len);

                for (let i = 0; i < len; i++) {
                    const price = (xau[i] * usd[i]) / 31.1035;
                    gramHist.push(parseFloat(price.toFixed(2)));
                }
                item.history = gramHist;
                console.log(`Calculated Gram Gold History: ${gramHist.length} points.`);
            }
        }
        // ONS
        else if (key === 'ons' || key === 'ONS') {
            item.history = xauHistory;
        }
        // DERIVED GOLD (Çeyrek, Yarım, Tam, Cumhuriyet, Ata, Reşat, Gremse, 22 Ayar)
        else if (key !== 'gram-altin' && key !== 'ons' && key !== 'dolar' && key !== 'euro' && key !== 'EUR' && data['gram-altin'] && item.type === 'gold' && item.history) {
            const gram = data['gram-altin'].history;
            if (gram && gram.length > 0) {
                // STRICT MULTIPLIERS
                let multiplier = 1.0;

                if (key.includes('ceyrek')) multiplier = 1.635;
                else if (key.includes('yarim')) multiplier = 3.27;
                else if (key.includes('tam')) multiplier = 6.54;
                else if (key.includes('cumhur')) multiplier = 6.90;
                else if (key.includes('ata')) multiplier = 7.15;
                else if (key.includes('resat')) multiplier = 7.10;
                else if (key.includes('grems')) multiplier = 16.35;
                else if (key.includes('besli')) multiplier = 32.70;
                else if (key.includes('ikibuc')) multiplier = 16.35;
                else if (key.includes('22')) multiplier = 0.916;
                else if (key.includes('18')) multiplier = 0.750;
                else if (key.includes('14')) multiplier = 0.583;

                if (multiplier !== 1.0) {
                    console.log(`Scaling ${key} with multiplier ${multiplier.toFixed(4)}`);
                    item.history = gram.map(v => parseFloat((v * multiplier).toFixed(2)));

                    // RESET CURRENT PRICE (Wipe corruption)
                    if (item.history.length > 0) {
                        const lastVal = item.history[item.history.length - 1];
                        item.current = lastVal;
                        item.selling = lastVal;
                        item.buying = parseFloat((lastVal * 0.98).toFixed(2));
                    }
                }
            }
        }
    });

    // 4. Update Crypto Data
    const cryptos = Object.keys(data).filter(k => data[k].type === 'crypto');
    for (const key of cryptos) {
        let symbol = data[key].code || key;
        const hist = await getBinanceHistory(symbol);
        if (hist.length > 0) {
            data[key].history = hist;
            console.log(`Updated ${key} history (${hist.length} pts).`);
        }
    }

    // 5. Save Single Master File
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));

    console.log("✅ data.json Updated Successfully!");
}

run();
