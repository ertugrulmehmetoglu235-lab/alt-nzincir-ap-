/**
 * fetch_real_history.js — Günlük canlı fiyat güncellemesi
 * ─────────────────────────────────────────────────────────
 * Kaynak Hiyerarşisi (Altın):
 *   1. Truncgil (birincil — gerçek Türkiye piyasası)
 *   2. Yahoo Finance GC=F × TRY=X (ikincil — uluslararası referans)
 *
 * Doğrulama Mantığı:
 *   • İki kaynak %15 içinde aynı yönde → gerçek hareket, Truncgil kullan
 *   • Sadece Truncgil farklıysa ama yön aynıysa → Türkiye piyasa farkı, Truncgil kullan
 *   • İkisi %15+ farklı ama YÖN ZIT → veri hatası, önceki geçerli fiyatı kullan
 */
const fs = require('fs');
const https = require('https');

const FILE = 'API_DOSYALARI/data.json';

// ── API URLs ─────────────────────────────────────────────────────────────────
const TRUNCGIL_URL = 'https://finans.truncgil.com/today.json';
const BINANCE_TICKER = 'https://api.binance.com/api/v3/ticker/24hr';
const GP_DOVIZ = 'https://api.genelpara.com/json/?list=doviz&sembol=all';
const GP_EMTIA = 'https://api.genelpara.com/json/?list=emtia&sembol=all';
// Yahoo Finance — altın çapraz doğrulaması için
const YAHOO_GOLD_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?range=2d&interval=1d';
const YAHOO_USDT_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/TRY%3DX?range=2d&interval=1d';

// ── HELPERS ───────────────────────────────────────────────────────────────────
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
        req.setTimeout(12000, () => { req.destroy(); resolve(null); });
    });
}

function parseTR(val) {
    if (val == null) return NaN;
    const s = String(val).replace(/[\s$€£¥]/g, '').replace(/TL/gi, '').trim();
    if (s === '' || s === '-') return NaN;
    if (s.includes(',') && s.includes('.')) {
        return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    }
    if (s.includes(',')) return parseFloat(s.replace(',', '.'));
    return parseFloat(s);
}

/**
 * Dual-source doğrulaması yaparak history'e ekler.
 *
 * @param {object} item        - data[key]
 * @param {number} primaryPrice  - Truncgil fiyatı
 * @param {number|null} refPrice - Yahoo Finance referans fiyatı (gram TRY cinsinden)
 * @param {string} label         - log için varlık adı
 */
function appendHistoryValidated(item, primaryPrice, refPrice = null, label = '') {
    if (isNaN(primaryPrice) || primaryPrice <= 0) return;
    if (!Array.isArray(item.history)) item.history = [];

    let priceToWrite = primaryPrice;
    const lastHistPrice = item.history.length > 0 ? item.history[item.history.length - 1] : null;

    if (refPrice && !isNaN(refPrice) && refPrice > 0 && lastHistPrice) {
        const primaryChange = (primaryPrice - lastHistPrice) / lastHistPrice; // % değişim (Truncgil)
        const refChange = (refPrice - lastHistPrice) / lastHistPrice;      // % değişim (Yahoo)
        const absDiff = Math.abs(primaryPrice - refPrice) / refPrice;    // İki kaynak arası fark

        const sameDirection = (primaryChange >= 0) === (refChange >= 0);
        const bigDeviation = absDiff > 0.15; // iki kaynak %15'ten fazla farklıysa

        if (bigDeviation && !sameDirection) {
            // YÖN ZIT + BÜYÜK SAPMA → veri hatası
            console.warn(`  ⚠️  [DOĞRULAMA HATASI] ${label}: Truncgil=${primaryPrice.toFixed(2)} vs Ref=${refPrice.toFixed(2)} (${(absDiff * 100).toFixed(1)}% fark, zıt yön) — önceki fiyat korundu: ${lastHistPrice}`);
            return; // Yazmıyoruz
        }

        if (bigDeviation && sameDirection) {
            // AYNI YÖN ama büyük fark → Türkiye piyasa farkı veya gerçek spike
            console.log(`  ℹ️  [PİYASA FARKI] ${label}: Truncgil=${primaryPrice.toFixed(2)} vs Ref=${refPrice.toFixed(2)} (${(absDiff * 100).toFixed(1)}% fark, aynı yön) — Truncgil kullanılıyor`);
        }
    }

    item.history.push(parseFloat(priceToWrite.toFixed(2)));
    if (item.history.length > 1826) item.history = item.history.slice(-1826);
}

// Doğrulama olmadan ekle (altın dışı varlıklar için)
function appendHistory(item, price) {
    if (isNaN(price) || price <= 0) return;
    if (!Array.isArray(item.history)) item.history = [];
    item.history.push(parseFloat(price.toFixed(2)));
    if (item.history.length > 1826) item.history = item.history.slice(-1826);
}

function seedIfMissing(data, key, name, code, type) {
    if (!data[key]) {
        data[key] = { name, code, type, history: [], current: 0, selling: 0, buying: 0, change: 0 };
    }
}

// ── TRUNCGIL KEY MAP ──────────────────────────────────────────────────────────
const TRUNCGIL_MAP = {
    'gram-altin': { key: 'gram-altin', name: 'Gram Altın', code: 'GRAM', type: 'gold', gramMultiplier: 1.000 },
    'ons': { key: 'ons', name: 'Ons Altın', code: 'ONS', type: 'gold', gramMultiplier: 31.1035 },
    'ceyrek-altin': { key: 'ceyrek-altin', name: 'Çeyrek Altın', code: 'CEYREK', type: 'gold', gramMultiplier: 1.702 },
    'yarim-altin': { key: 'yarim-altin', name: 'Yarım Altın', code: 'YARIM', type: 'gold', gramMultiplier: 3.403 },
    'tam-altin': { key: 'tam-altin', name: 'Tam Altın', code: 'TAM', type: 'gold', gramMultiplier: 6.787 },
    'cumhuriyet-altini': { key: 'cumhuriyet-altini', name: 'Cumhuriyet Altını', code: 'CUMHUR', type: 'gold', gramMultiplier: 7.002 },
    'ata-altin': { key: 'ata-altin', name: 'Ata Altın', code: 'ATAALT', type: 'gold', gramMultiplier: 7.037 },
    'resat-altin': { key: 'resat-altin', name: 'Reşat Altın', code: 'RESAT', type: 'gold', gramMultiplier: 7.037 },
    'hamit-altin': { key: 'hamit-altin', name: 'Hamit Altın', code: 'HAMIT', type: 'gold', gramMultiplier: 7.037 },
    'besli-altin': { key: 'besli-altin', name: 'Beşli Altın', code: 'BESLI', type: 'gold', gramMultiplier: 34.35 },
    'gremse-altin': { key: 'gremse-altin', name: 'Gremse Altın', code: 'GREMSE', type: 'gold', gramMultiplier: 17.02 },
    'ikibucuk-altin': { key: 'ikibucuk-altin', name: 'İkibuçuk Altın', code: 'IKIBUC', type: 'gold', gramMultiplier: 16.90 },
    'gram-has-altin': { key: 'gram-has-altin', name: 'Gram Has Altın', code: 'HAS', type: 'gold', gramMultiplier: 0.995 },
    '14-ayar-altin': { key: '14-ayar-altin', name: '14 Ayar Altın', code: '14AYAR', type: 'gold', gramMultiplier: 0.583 },
    '18-ayar-altin': { key: '18-ayar-altin', name: '18 Ayar Altın', code: '18AYAR', type: 'gold', gramMultiplier: 0.750 },
    '22-ayar-bilezik': { key: '22-ayar-bilezik', name: '22 Ayar Bilezik', code: '22AYAR', type: 'gold', gramMultiplier: 0.916 },
    'gumus': { key: 'gumus', name: 'Gümüş', code: 'GUMUS', type: 'commodity', gramMultiplier: null },
    'gram-platin': { key: 'gram-platin', name: 'Gram Platin', code: 'PLATIN', type: 'commodity', gramMultiplier: null },
    'gram-paladyum': { key: 'gram-paladyum', name: 'Gram Paladyum', code: 'PALADYUM', type: 'commodity', gramMultiplier: null },
};

const CURRENCY_NAMES = {
    'USD': 'ABD Doları', 'EUR': 'Euro', 'GBP': 'İngiliz Sterlini',
    'JPY': 'Japon Yeni', 'CHF': 'İsviçre Frangı', 'CAD': 'Kanada Doları',
    'AUD': 'Avustralya Doları', 'SAR': 'Suudi Riyali', 'RUB': 'Rus Rublesi',
    'KWD': 'Kuveyt Dinarı', 'AZN': 'Azerbaycan Manatı', 'BGN': 'Bulgar Levası',
    'NOK': 'Norveç Kronu', 'SEK': 'İsveç Kronu', 'DKK': 'Danimarka Kronu',
    'DZD': 'Cezayir Dinarı', 'QAR': 'Katar Riyali', 'OMR': 'Umman Riyali',
    'SGD': 'Singapur Doları', 'HKD': 'Hong Kong Doları', 'MXN': 'Meksika Pesosu',
    'BRL': 'Brezilya Reali', 'ZAR': 'Güney Afrika Randı', 'AED': 'BAE Dirhemi',
    'BHD': 'Bahreyn Dinarı', 'IQD': 'Irak Dinarı', 'ILS': 'İsrail Şekeli',
};

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function run() {
    let data = {};
    try {
        data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        console.log(`✅ data.json yüklendi (${Object.keys(data).length} varlık)`);
    } catch (e) {
        console.warn('⚠️ data.json okunamadı, sıfırdan başlıyor:', e.message);
        data = {};
    }

    // ── REFERANS: Yahoo Finance gram altın TRY fiyatı ─────────────────────────
    console.log('\n=== Referans: Yahoo Finance (GC=F × TRY=X) ===');
    let yahooGramAltinTRY = null;
    try {
        const [gcData, tryData] = await Promise.all([
            fetchJson(YAHOO_GOLD_URL),
            fetchJson(YAHOO_USDT_URL)
        ]);
        const gcClose = gcData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
        const tryClose = tryData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
        if (gcClose && tryClose) {
            const gcLast = gcClose.filter(p => p != null).pop();
            const tryLast = tryClose.filter(p => p != null).pop();
            if (gcLast && tryLast) {
                yahooGramAltinTRY = parseFloat(((gcLast * tryLast) / 31.1035).toFixed(2));
                console.log(`  GC=F: $${gcLast.toFixed(2)} × TRY=X: ${tryLast.toFixed(4)} → Gram Altın: ₺${yahooGramAltinTRY}`);
            }
        }
    } catch (e) {
        console.warn('  ⚠️ Yahoo Finance referans alınamadı:', e.message);
    }

    // ── A. ALTIN (Truncgil — birincil) ────────────────────────────────────────
    console.log('\n=== A. Altın (Truncgil + Yahoo çapraz doğrulama) ===');
    const tData = await fetchJson(TRUNCGIL_URL);
    if (tData) {
        let goldCount = 0;
        Object.entries(TRUNCGIL_MAP).forEach(([tKey, info]) => {
            const row = tData[tKey];
            if (!row) return;
            const satisKey = Object.keys(row).find(k => k.toLowerCase().includes('sat'));
            const alisKey = Object.keys(row).find(k => k.toLowerCase().includes('al') && !k.toLowerCase().includes('sat'));
            const degKey = Object.keys(row).find(k => k.toLowerCase().includes('değ') || k.toLowerCase().includes('deg'));
            const satis = parseTR(satisKey ? row[satisKey] : row['Satis']);
            const alis = parseTR(alisKey ? row[alisKey] : row['Alis']);
            const change = parseTR(String(degKey ? row[degKey] : 0).replace('%', ''));
            if (isNaN(satis) || satis <= 0) return;

            seedIfMissing(data, info.key, info.name, info.code, info.type);
            data[info.key].name = info.name;
            data[info.key].code = info.code;
            data[info.key].type = info.type;
            data[info.key].current = satis;
            data[info.key].selling = satis;
            data[info.key].buying = !isNaN(alis) && alis > 0 ? alis : satis * 0.99;
            data[info.key].change = !isNaN(change) ? change : 0;

            // Referans fiyatı hesapla (gram çarpanından)
            let refPrice = null;
            if (yahooGramAltinTRY && info.gramMultiplier) {
                refPrice = parseFloat((yahooGramAltinTRY * info.gramMultiplier).toFixed(2));
            }

            appendHistoryValidated(data[info.key], satis, refPrice, info.name);
            goldCount++;
            console.log(`  ${tKey}: ₺${satis} ${refPrice ? `(ref: ₺${refPrice})` : ''}`);
        });
        console.log(`Truncgil: ${goldCount} altın/emtia kaydedildi`);
    } else {
        console.warn('⚠️ Truncgil verisi alınamadı');
    }

    // ── B. DÖVİZ (Truncgil — Tür==='Döviz' satırları) ────────────────────────
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
    // Truncgil'de eksik dövizler için GenelPara fallback
    if (dvzCount < 5) {
        console.log('  ⚠️ Truncgil döviz yetersiz, GenelPara denemeleri...');
        const gpDoviz = await fetchJson(GP_DOVIZ);
        if (gpDoviz) {
            Object.keys(gpDoviz).forEach(sym => {
                if (data[sym]?.current > 0) return; // Truncgil'den geldiyse atlıyoruz
                const row = gpDoviz[sym];
                const satis = parseTR(row.satis);
                const alis = parseTR(row.alis);
                const change = parseTR(String(row.oran || row.degisim || '0').replace('%', ''));
                if (isNaN(satis) || satis <= 0) return;
                const name = CURRENCY_NAMES[sym] || sym;
                seedIfMissing(data, sym, name, sym, 'currency');
                data[sym].name = name; data[sym].current = satis;
                data[sym].selling = satis;
                data[sym].buying = !isNaN(alis) && alis > 0 ? alis : satis * 0.99;
                data[sym].change = !isNaN(change) ? change : 0;
                if (sym === 'USD') usdTry = satis;
                appendHistory(data[sym], satis);
                dvzCount++;
            });
        }
    }
    console.log(`Döviz: ${dvzCount} döviz kaydedildi`);

    // ── C. EMTİA (GenelPara) ──────────────────────────────────────────────────
    console.log('\n=== C. Emtia (GenelPara) ===');
    const gpEmtiaRaw = await fetchJson(GP_EMTIA);
    const gpEmtia = gpEmtiaRaw?.data || gpEmtiaRaw || null;
    if (gpEmtia && typeof gpEmtia === 'object') {
        let emtiaCount = 0;
        Object.keys(gpEmtia).forEach(sym => {
            const row = gpEmtia[sym];
            if (!row) return;
            const val = parseTR(row.satis || '0');
            const change = parseTR(String(row.oran || row.degisim || '0').replace('%', ''));
            if (isNaN(val) || val <= 0) return;
            const sl = sym.toLowerCase();
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

    // ── D. KRİPTO (Binance) ───────────────────────────────────────────────────
    console.log('\n=== D. Kripto (Binance) ===');
    const bTicker = await fetchJson(BINANCE_TICKER);
    if (Array.isArray(bTicker)) {
        const cryptos = Object.keys(data).filter(k => data[k].type === 'crypto');
        let cryptoCount = 0;
        bTicker.forEach(t => {
            if (!t.symbol.endsWith('USDT')) return;
            const base = t.symbol.replace('USDT', '').toLowerCase();
            const key = cryptos.find(k => k === base || data[k]?.code?.toLowerCase() === base);
            if (!key) return;
            const priceUSD = parseFloat(t.lastPrice);
            const priceTRY = parseFloat((priceUSD * usdTry).toFixed(2));
            const change = parseFloat(parseFloat(t.priceChangePercent).toFixed(2));
            if (isNaN(priceTRY) || priceTRY <= 0) return;
            data[key].current = priceTRY;
            data[key].selling = priceTRY;
            data[key].buying = priceTRY;
            data[key].change = change;
            appendHistory(data[key], priceTRY);
            cryptoCount++;
        });
        console.log(`Binance Kripto: ${cryptoCount} kripto kaydedildi`);
    } else {
        console.warn('⚠️ Binance verisi alınamadı');
    }

    // ── KAYDET ────────────────────────────────────────────────────────────────
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log(`\n✅ data.json kaydedildi! (${Object.keys(data).length} varlık)`);
}

run().catch(err => {
    console.error('❌ Script hatası:', err);
    process.exit(1);
});
