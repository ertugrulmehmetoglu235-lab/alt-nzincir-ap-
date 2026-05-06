/**
 * fetch_current.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Her 5 dakikada GitHub Actions tarafından çalıştırılır.
 * Truncgil (altın + döviz) ve CoinGecko (kripto) kaynaklarından anlık fiyatları çeker,
 * data/current.json dosyasına yazar.
 *
 * App artık doğrudan API'lere istek atmaz — sadece bu dosyayı okur.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs    = require('fs');
const https = require('https');
const path  = require('path');

const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'current.json');

// ── Kaynak URL'leri ───────────────────────────────────────────────────────────
const TRUNCGIL_URL   = 'https://finans.truncgil.com/today.json';
const GENPARA_DOVIZ  = 'https://api.genelpara.com/json/?list=doviz&sembol=all';

// AltinAPI (eski adıyla HaremAPI) — altın için birincil kaynak
// Ücretsiz plan: ayda 30 istek (script 5 dk'da bir = ~8640 req/ay → ücretli plan gerekir)
// Endpoint kesinleştiğinde buraya yaz; şimdilik en olası pattern kullanılıyor.
// Sembol adlarını doğrulamak için: node scripts/test_altinapi.js
const ALTINAPI_KEY  = 'hapi_524b1663914e453ca777773d9c860833';
const ALTINAPI_URL  = 'https://altinapi.com/api/v1/prices';
const COINGECKO_IDS = [
    'bitcoin', 'ethereum', 'binancecoin', 'solana', 'ripple', 'dogecoin',
    'avalanche-2', 'litecoin', 'cardano', 'polkadot', 'chainlink', 'tron',
    'shiba-inu', 'matic-network', 'cosmos', 'near', 'stellar', 'monero',
    'ethereum-classic', 'the-open-network', 'injective-protocol', 'sui',
    'aptos', 'arbitrum', 'optimism', 'uniswap', 'pepe', 'filecoin', 'hedera',
].join(',');
const COINGECKO_URL  = `https://api.coingecko.com/api/v3/simple/price`
    + `?ids=${COINGECKO_IDS}&vs_currencies=usd&include_24hr_change=true`;

// ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────
function fetchJson(url, extraHeaders = {}) {
    return new Promise(resolve => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json,*/*',
                ...extraHeaders
            }
        }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchJson(res.headers.location).then(resolve);
            }
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try {
                    if (raw.trimStart().startsWith('<')) { resolve(null); return; }
                    resolve(JSON.parse(raw));
                } catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    });
}

function parseTR(val) {
    if (val == null) return NaN;
    const s = String(val).replace(/[\s$€£¥TL]/gi, '').trim();
    if (!s || s === '-') return NaN;
    if (s.includes(',') && s.includes('.')) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    if (s.includes(',')) return parseFloat(s.replace(',', '.'));
    return parseFloat(s);
}

// ── Altın key → meta tablosu ──────────────────────────────────────────────────
const GOLD_MAP = {
    'gram-altin':      { name: 'Gram Altın',         code: 'GRAM',    type: 'gold' },
    'ons':             { name: 'Ons Altın',           code: 'ONS',     type: 'gold', isUSD: true },
    'ceyrek-altin':    { name: 'Çeyrek Altın',        code: 'CEYREK',  type: 'gold' },
    'yarim-altin':     { name: 'Yarım Altın',         code: 'YARIM',   type: 'gold' },
    'tam-altin':       { name: 'Tam Altın',           code: 'TAM',     type: 'gold' },
    'cumhuriyet-altini':{ name:'Cumhuriyet Altını',   code: 'CUMHUR',  type: 'gold' },
    'ata-altin':       { name: 'Ata Altın',           code: 'ATAALT',  type: 'gold' },
    'resat-altin':     { name: 'Reşat Altın',         code: 'RESAT',   type: 'gold' },
    'hamit-altin':     { name: 'Hamit Altın',         code: 'HAMIT',   type: 'gold' },
    'gram-has-altin':  { name: 'Gram Has Altın',      code: 'HAS',     type: 'gold' },
    '14-ayar-altin':   { name: '14 Ayar Altın',       code: '14AYAR',  type: 'gold' },
    '18-ayar-altin':   { name: '18 Ayar Altın',       code: '18AYAR',  type: 'gold' },
    '22-ayar-bilezik': { name: '22 Ayar Bilezik',     code: '22AYAR',  type: 'gold' },
    'gumus':           { name: 'Gümüş',               code: 'GUMUS',   type: 'commodity' },
    'gram-platin':     { name: 'Gram Platin',          code: 'PLATIN',  type: 'commodity' },
};

const CURRENCY_NAMES = {
    USD: 'ABD Doları', EUR: 'Euro', GBP: 'İngiliz Sterlini',
    JPY: 'Japon Yeni', CHF: 'İsviçre Frangı', CAD: 'Kanada Doları',
    AUD: 'Avustralya Doları', SAR: 'Suudi Riyali', RUB: 'Rus Rublesi',
    KWD: 'Kuveyt Dinarı', AZN: 'Azerbaycan Manatı', AED: 'BAE Dirhemi',
    QAR: 'Katar Riyali', ILS: 'İsrail Şekeli',
};

// İzlenecek kriptolar (CoinGecko ID → varlık anahtarı)
const CRYPTO_MAP = {
    'bitcoin':             { key: 'btc',  name: 'Bitcoin',    code: 'BTC',  type: 'crypto' },
    'ethereum':            { key: 'eth',  name: 'Ethereum',   code: 'ETH',  type: 'crypto' },
    'binancecoin':         { key: 'bnb',  name: 'BNB',        code: 'BNB',  type: 'crypto' },
    'solana':              { key: 'sol',  name: 'Solana',     code: 'SOL',  type: 'crypto' },
    'ripple':              { key: 'xrp',  name: 'XRP',        code: 'XRP',  type: 'crypto' },
    'dogecoin':            { key: 'doge', name: 'Dogecoin',   code: 'DOGE', type: 'crypto' },
    'avalanche-2':         { key: 'avax', name: 'Avalanche',  code: 'AVAX', type: 'crypto' },
    'litecoin':            { key: 'ltc',  name: 'Litecoin',   code: 'LTC',  type: 'crypto' },
    'cardano':             { key: 'ada',  name: 'Cardano',    code: 'ADA',  type: 'crypto' },
    'polkadot':            { key: 'dot',  name: 'Polkadot',   code: 'DOT',  type: 'crypto' },
    'chainlink':           { key: 'link', name: 'Chainlink',  code: 'LINK', type: 'crypto' },
    'tron':                { key: 'trx',  name: 'TRON',       code: 'TRX',  type: 'crypto' },
    'shiba-inu':           { key: 'shib', name: 'Shiba Inu',  code: 'SHIB', type: 'crypto' },
    'matic-network':       { key: 'matic',name: 'Polygon',    code: 'MATIC',type: 'crypto' },
    'cosmos':              { key: 'atom', name: 'Cosmos',     code: 'ATOM', type: 'crypto' },
    'near':                { key: 'near', name: 'NEAR',       code: 'NEAR', type: 'crypto' },
    'stellar':             { key: 'xlm',  name: 'Stellar',    code: 'XLM',  type: 'crypto' },
    'monero':              { key: 'xmr',  name: 'Monero',     code: 'XMR',  type: 'crypto' },
    'ethereum-classic':    { key: 'etc',  name: 'ETH Classic',code: 'ETC',  type: 'crypto' },
    'the-open-network':    { key: 'ton',  name: 'Toncoin',    code: 'TON',  type: 'crypto' },
    'injective-protocol':  { key: 'inj',  name: 'Injective',  code: 'INJ',  type: 'crypto' },
    'sui':                 { key: 'sui',  name: 'Sui',        code: 'SUI',  type: 'crypto' },
    'aptos':               { key: 'apt',  name: 'Aptos',      code: 'APT',  type: 'crypto' },
    'arbitrum':            { key: 'arb',  name: 'Arbitrum',   code: 'ARB',  type: 'crypto' },
    'optimism':            { key: 'op',   name: 'Optimism',   code: 'OP',   type: 'crypto' },
    'uniswap':             { key: 'uni',  name: 'Uniswap',    code: 'UNI',  type: 'crypto' },
    'pepe':                { key: 'pepe', name: 'Pepe',       code: 'PEPE', type: 'crypto' },
    'filecoin':            { key: 'fil',  name: 'Filecoin',   code: 'FIL',  type: 'crypto' },
    'hedera':              { key: 'hbar', name: 'Hedera',     code: 'HBAR', type: 'crypto' },
};

// ── Ana fonksiyon ─────────────────────────────────────────────────────────────
async function run() {
    // Mevcut dosyayı oku (yoksa boş başla)
    let current = {};
    try { current = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8')); } catch {}

    // ── 1a. AltinAPI (Altın - Birincil) ─────────────────────────────────────
    // Truncgil Ata/Reşat/Hamit için aynı fiyatı döndürüyor; AltinAPI ayrı fiyat verir.
    // Sembol adları test_altinapi.js çıktısına göre güncellenmeli (TODO).
    // Şu an bilinen semboller: ALTIN22=gram, ONS, CEYREK_YENI, CEYREK_ESK,
    //   YARIM_YENI, TAM_YENI, CUMHURIYET, ATA_YENI, ATA_ESK, ATA5_YENI, GREMSE_YENI
    // ⚠️ Reşat ve Hamit AltinAPI'de ayrı sembol olarak YOK olabilir.
    const ALTINAPI_GOLD_MAP = {
        'ALTIN22':      'gram-altin',
        'ONS':          'ons',
        'CEYREK_YENI':  'ceyrek-altin',
        'YARIM_YENI':   'yarim-altin',
        'TAM_YENI':     'tam-altin',
        'CUMHURIYET':   'cumhuriyet-altini',
        'ATA_YENI':     'ata-altin',
        'RESAT':        'resat-altin',
        'HAMIT':        'hamit-altin',
    };

    console.log('⬇️  AltinAPI altın çekiliyor...');
    let altinApiOk = false;
    const haData = await fetchJson(ALTINAPI_URL, { 'Authorization': `Bearer ${ALTINAPI_KEY}` });

    if (haData && typeof haData === 'object' && !haData.error) {
        // AltinAPI yanıtı: { ALTIN22: { buying, selling, changeRate }, ... }
        // veya dizi formatı olabilir — endpoint kesinleşince uyarla
        const rows = Array.isArray(haData) ? haData : Object.entries(haData).map(([code, v]) => ({ code, ...v }));
        let count = 0;
        rows.forEach(item => {
            const internalKey = ALTINAPI_GOLD_MAP[item.code];
            if (!internalKey) return;
            const meta = GOLD_MAP[internalKey];
            if (!meta) return;
            const satis = parseFloat(item.selling ?? item.satis ?? item.sell ?? 0);
            const alis  = parseFloat(item.buying  ?? item.alis  ?? item.buy  ?? 0);
            const chg   = parseFloat(item.changeRate ?? item.change ?? item.degisim ?? 0);
            if (!satis || satis <= 0) return;
            current[internalKey] = {
                name: meta.name, code: meta.code, type: meta.type,
                current: satis, selling: satis,
                buying:  alis > 0 ? alis : parseFloat((satis * 0.995).toFixed(2)),
                change:  chg
            };
            count++;
        });
        if (count > 0) {
            altinApiOk = true;
            console.log(`  ✅ AltinAPI: ${count} altın işlendi`);
        } else {
            console.warn('  ⚠️ AltinAPI bağlandı ama veri eşleşmedi — sembol adları kontrol edilmeli (test_altinapi.js)');
        }
    } else {
        console.warn('  ⚠️ AltinAPI verisi alınamadı');
    }

    // ── 1b. Truncgil (Altın + Döviz — Yedek) ────────────────────────────────
    // AltinAPI başarısız olursa altın için Truncgil devreye girer.
    // Döviz her zaman Truncgil'den alınır (AltinAPI döviz sunmuyor).
    console.log(altinApiOk ? '⬇️  Truncgil döviz çekiliyor...' : '⬇️  Truncgil (yedek) altın + döviz çekiliyor...');
    const tData = await fetchJson(TRUNCGIL_URL);
    let usdTry = current['USD']?.current || 38;

    if (tData) {
        // USD/TRY'yi ilk önce al (ons dönüşümü için lazım)
        if (tData['USD']) {
            const u = parseTR(tData['USD']['Satış'] || tData['USD']['Satis']);
            if (!isNaN(u) && u > 0) usdTry = u;
        }

        // Altın — sadece AltinAPI başarısız olduysa yaz
        if (!altinApiOk) {
            Object.entries(GOLD_MAP).forEach(([tKey, meta]) => {
                const row = tData[tKey];
                if (!row) return;
                const satisKey = Object.keys(row).find(k => /sat/i.test(k));
                const alisKey  = Object.keys(row).find(k => /al/i.test(k) && !/sat/i.test(k));
                const degKey   = Object.keys(row).find(k => /değ|deg/i.test(k));
                let satis  = parseTR(satisKey ? row[satisKey] : null);
                let alis   = parseTR(alisKey  ? row[alisKey]  : null);
                const chg  = parseTR(String(degKey ? row[degKey] : 0).replace('%', ''));
                if (isNaN(satis) || satis <= 0) return;
                if (meta.isUSD) {
                    satis = parseFloat((satis * usdTry).toFixed(2));
                    if (!isNaN(alis) && alis > 0) alis = parseFloat((alis * usdTry).toFixed(2));
                }
                current[tKey] = {
                    name: meta.name, code: meta.code, type: meta.type,
                    current: satis, selling: satis,
                    buying:  !isNaN(alis) && alis > 0 ? alis : parseFloat((satis * 0.995).toFixed(2)),
                    change:  !isNaN(chg) ? chg : 0
                };
            });
            console.warn('  ⚠️ Truncgil yedek altın kullanıldı');
        }

        // Döviz — her zaman Truncgil'den
        Object.entries(tData).forEach(([sym, row]) => {
            if (!row || row['Tür'] !== 'Döviz') return;
            const satis  = parseTR(row['Satış'] || row['Satis']);
            const alis   = parseTR(row['Alış']  || row['Alis']);
            const chgStr = String(row['Değişim'] || '0').replace('%', '');
            const chg    = parseTR(chgStr);
            if (isNaN(satis) || satis <= 0) return;
            current[sym] = {
                name: CURRENCY_NAMES[sym] || sym, code: sym, type: 'currency',
                current: satis, selling: satis,
                buying:  !isNaN(alis) && alis > 0 ? alis : parseFloat((satis * 0.995).toFixed(2)),
                change:  !isNaN(chg) ? chg : 0
            };
        });
        console.log(`  ✅ Truncgil: döviz işlendi`);
    } else {
        console.warn('  ⚠️ Truncgil verisi alınamadı, mevcut fiyatlar korunuyor');
    }

    // Truncgil dövizi yetersizse GenelPara fallback
    const hasDoviz = Object.values(current).filter(v => v.type === 'currency').length;
    if (hasDoviz < 5) {
        console.log('⬇️  GenelPara döviz fallback...');
        const gpData = await fetchJson(GENPARA_DOVIZ);
        if (gpData) {
            Object.entries(gpData).forEach(([sym, row]) => {
                if (current[sym]?.current > 0) return;
                const satis = parseTR(row.satis);
                if (isNaN(satis) || satis <= 0) return;
                current[sym] = {
                    name: CURRENCY_NAMES[sym] || sym, code: sym, type: 'currency',
                    current: satis, selling: satis,
                    buying:  parseFloat((satis * 0.995).toFixed(2)),
                    change:  parseTR(String(row.oran || 0).replace('%', '')) || 0
                };
                if (sym === 'USD') usdTry = satis;
            });
        }
    }

    // ── 2. CoinGecko (Kripto) ────────────────────────────────────────────────
    // NOT: Daha önce Binance (api.binance.com) kullanıldı; GitHub Actions ortamında
    // 3 ayrı denemede coğrafi blok nedeniyle hiç veri gelmedi. Binance'e geri dönülmemeli.
    console.log('⬇️  CoinGecko kripto çekiliyor...');
    const cgData = await fetchJson(COINGECKO_URL);
    if (cgData && typeof cgData === 'object') {
        let count = 0;
        Object.entries(cgData).forEach(([id, ticker]) => {
            const meta = CRYPTO_MAP[id];
            if (!meta) return;
            const priceUSD = parseFloat(ticker.usd);
            const priceTRY = parseFloat((priceUSD * usdTry).toFixed(2));
            const chg      = parseFloat((ticker.usd_24h_change || 0).toFixed(2));
            if (isNaN(priceTRY) || priceTRY <= 0) return;
            current[meta.key] = {
                name: meta.name, code: meta.code, type: 'crypto',
                current: priceTRY, selling: priceTRY, buying: priceTRY,
                change: chg
            };
            count++;
        });
        console.log(`  ✅ CoinGecko: ${count} kripto işlendi`);
    } else {
        console.warn('  ⚠️ CoinGecko verisi alınamadı');
    }

    // ── Meta bilgisi ekle ve kaydet ───────────────────────────────────────────
    current['_meta'] = {
        updated_at: new Date().toISOString(),
        source: 'GitHub Actions / fetch_current.js'
    };

    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(current, null, 2), 'utf8');
    console.log(`\n✅ data/current.json kaydedildi (${Object.keys(current).length - 1} varlık)`);
}

run().catch(err => {
    console.error('❌ Hata:', err);
    process.exit(1);
});
