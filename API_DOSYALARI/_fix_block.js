async function fetchLivePrices() {
    debugLog('LIVE Canlı Veri Güncelleniyor...');

    const parseTR = (s) => parseFloat(String(s).replace(/[$\u20AC TL\s]/g, '').replace(/\./g, '').replace(',', '.'));
    const parseNum = (s) => parseFloat(String(s).replace(',', '.'));

    // ========================
    // A. TRUNCGIL -- Altın & Emtia (gümüş/platin/paladyum)
    // ========================
    try {
        const tRes = await fetch(TRUNCGIL_URL + '?t=' + Date.now());
        const tData = await tRes.json();

        if (tData['USD']) usdTry = parseTR(tData['USD'].Satis);

        const safeCodeMap = {
            'ata-altin': 'ATAALT', 'resat-altin': 'RESAT', 'hamit-altin': 'HAMIT',
            'besli-altin': 'BESLI', 'gremse-altin': 'GREMSE', 'gram-has-altin': 'HAS',
            'ceyrek-altin': 'CEYREK', 'yarim-altin': 'YARIM', 'tam-altin': 'TAM',
            'cumhuriyet-altini': 'CUMHUR', 'ikibucuk-altin': 'IKIBUC',
            '14-ayar-altin': '14AYAR', '18-ayar-altin': '18AYAR', '22-ayar-bilezik': '22AYAR',
            'gumus': 'GUMUS', 'gram-platin': 'PLATIN', 'gram-paladyum': 'PALADYUM', 'ons': 'ONS'
        };
        const nameMap = {
            'ata-altin': 'Ata Alt\u0131n', 'resat-altin': 'Re\u015fat Alt\u0131n', 'hamit-altin': 'Hamit Alt\u0131n',
            'besli-altin': 'Be\u015fli Alt\u0131n', 'gremse-altin': 'Gremse Alt\u0131n', 'gram-has-altin': 'Gram Has Alt\u0131n',
            'gram-platin': 'Gram Platin', 'gram-paladyum': 'Gram Paladyum', 'gumus': 'G\u00fcm\u00fc\u015f',
            'ons': 'Ons Alt\u0131n', 'gram-altin': 'Gram Alt\u0131n', 'ceyrek-altin': '\u00c7eyrek Alt\u0131n',
            'yarim-altin': 'Yar\u0131m Alt\u0131n', 'tam-altin': 'Tam Alt\u0131n', 'cumhuriyet-altini': 'Cumhuriyet Alt\u0131n\u0131',
            '14-ayar-altin': '14 Ayar Alt\u0131n', '18-ayar-altin': '18 Ayar Alt\u0131n',
            '22-ayar-bilezik': '22 Ayar Bilezik', 'ikibucuk-altin': '\u0130kibu\u00e7uk Alt\u0131n'
        };

        Object.keys(tData).forEach(key => {
            if (key === 'Update_Date') return;
            const row = tData[key];
            const isGold = (row.Tur === 'Altin' || row['T\u00fcr'] === 'Alt\u0131n') || key === 'ons';
            const isCommodity = key.includes('gumus') || key.includes('platin') || key.includes('paladyum');
            if (!isGold && !isCommodity) return;

            const type = isCommodity ? 'commodity' : 'gold';
            const satisKey = Object.keys(row).find(k => k.toLowerCase().includes('sat'));
            const alisKey = Object.keys(row).find(k => k.toLowerCase() === 'al\u0131\u015f' || k.toLowerCase() === 'alis');
            const degKey = Object.keys(row).find(k => k.toLowerCase().includes('de\u011f') || k.toLowerCase().includes('deg'));
            const val = parseTR(satisKey ? row[satisKey] : row.Satis || 0);
            const buyingVal = alisKey ? parseTR(row[alisKey]) : 0;
            const change = degKey ? parseNum(String(row[degKey]).replace('%', '')) : 0;
            const name = nameMap[key] || globalCatalog[key]?.name || key;
            const code = safeCodeMap[key] || globalCatalog[key]?.code || key.toUpperCase();
            const history = globalCatalog[key]?.history || [];

            if (!isNaN(val) && val > 0) {
                globalCatalog[key] = {
                    ...globalCatalog[key],
                    id: key, name, code, type, history,
                    current: val, selling: val,
                    buying: buyingVal > 0 ? buyingVal : val * 0.99,
                    change
                };
            }
        });
        debugLog('OK Truncgil (Alt\u0131n/Emtia): y\u00fcklendi');
    } catch (e) { debugLog('ERR Truncgil Hatas\u0131: ' + e.message); }

    // ========================
    // B. GENELPARA -- Döviz, Emtia, Hisse
    // ========================
    const gpBase = 'https://api.genelpara.com/json/';

    // B1. Döviz (Currency)
    try {
        const res = await fetch(gpBase + '?list=doviz&sembol=all');
        const data = await res.json();
        Object.keys(data).forEach(sym => {
            const row = data[sym];
            const val = parseNum(row.satis);
            const buyVal = parseNum(row.alis);
            const change = parseNum(row.yuzde);
            if (isNaN(val) || val <= 0) return;
            const history = globalCatalog[sym]?.history || [];
            const currNames = {
                'USD': 'ABD Dolar\u0131', 'EUR': 'Euro', 'GBP': '\u0130ngiliz Sterlini',
                'JPY': 'Japon Yeni', 'CHF': '\u0130svi\u00e7re Frang\u0131', 'CAD': 'Kanada Dolar\u0131',
                'AUD': 'Avustralya Dolar\u0131', 'SAR': 'Suudi Riyali', 'RUB': 'Rus Rublesi',
                'KWD': 'Kuveyt Dinar\u0131', 'AZN': 'Azerbaycan Manat\u0131', 'BGN': 'Bulgar Levas\u0131'
            };
            globalCatalog[sym] = {
                ...globalCatalog[sym],
                id: sym, name: currNames[sym] || globalCatalog[sym]?.name || sym,
                code: sym, type: 'currency', history,
                current: val, selling: val,
                buying: buyVal > 0 ? buyVal : val * 0.99,
                change
            };
            if (sym === 'USD') usdTry = val;
        });
        debugLog('OK GenelPara D\u00f6viz: ' + Object.keys(data).length + ' veri');
    } catch (e) { debugLog('WARN GenelPara D\u00f6viz Hatas\u0131: ' + e.message); }

    // B2. Emtia (Commodities not from Truncgil)
    try {
        const res = await fetch(gpBase + '?list=emtia&sembol=all');
        const data = await res.json();
        Object.keys(data).forEach(sym => {
            const row = data[sym];
            const val = parseNum(row.satis);
            const change = parseNum(row.yuzde);
            if (isNaN(val) || val <= 0) return;
            const sl = sym.toLowerCase();
            if (sl.includes('altin') || sl.includes('gumus') || sl === 'xau' || sl === 'xag') return;
            const key = 'emtia-' + sl;
            const history = globalCatalog[key]?.history || [];
            globalCatalog[key] = {
                ...globalCatalog[key],
                id: key, name: globalCatalog[key]?.name || sym,
                code: sym, type: 'commodity', history,
                current: val, selling: val, buying: val * 0.99, change
            };
        });
        debugLog('OK GenelPara Emtia: ' + Object.keys(data).length + ' veri');
    } catch (e) { debugLog('WARN GenelPara Emtia Hatas\u0131: ' + e.message); }

    // B3. Hisse (BIST Stocks)
    try {
        const res = await fetch(gpBase + '?list=hisse&sembol=all');
        const data = await res.json();
        Object.keys(data).forEach(sym => {
            const row = data[sym];
            const val = parseNum(row.satis || row.son || row.kapanis);
            const change = parseNum(row.yuzde);
            if (isNaN(val) || val <= 0) return;
            const key = 'hisse-' + sym.toLowerCase();
            const history = globalCatalog[key]?.history || [];
            globalCatalog[key] = {
                ...globalCatalog[key],
                id: key, name: globalCatalog[key]?.name || sym,
                code: sym, type: 'stock', history,
                current: val, selling: val, buying: val, change
            };
        });
        debugLog('OK GenelPara Hisse: ' + Object.keys(data).length + ' veri');
    } catch (e) { debugLog('WARN GenelPara Hisse Hatas\u0131: ' + e.message); }

    // ========================
    // C. BINANCE -- Crypto only
    // ========================
    try {
        const bRes = await fetch(BINANCE_URL);
        const bData = await bRes.json();
        if (Array.isArray(bData)) {
            bData.forEach(coin => {
                if (!coin.symbol.endsWith('USDT')) return;
                const code = coin.symbol.replace('USDT', '');
                const catKey = Object.keys(globalCatalog).find(k =>
                    globalCatalog[k].code === code && globalCatalog[k].type === 'crypto'
                );
                if (catKey) {
                    const priceInTRY = parseFloat(coin.lastPrice) * usdTry;
                    globalCatalog[catKey].current = priceInTRY;
                    globalCatalog[catKey].selling = priceInTRY;
                    globalCatalog[catKey].change = parseFloat(coin.priceChangePercent);
                }
            });
        }
    } catch (e) { debugLog('WARN Binance Hatas\u0131: ' + e.message); }

    // ========================
    // RENDER
    // ========================
    if (Object.keys(globalCatalog).length > 0) {
        processApiData(globalCatalog);
        renderAll();
        setupConverter();
    }
}

function startAutoRefresh() {
    const INTERVAL = 5 * 60 * 1000;
    setInterval(() => {
        debugLog('AUTO Otomatik G\u00fcncelleme...');
        fetchLivePrices();
    }, INTERVAL);
}

async function loadNews() {
    try {
        const res = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https://tr.investing.com/rss/news.rss');
        const d = await res.json();
        if (d.items) {
            const h = d.items.slice(0, 10).map(i =>
                '<div onclick="window.open(\'' + i.link + '\',\'_blank\')" style="background:var(--bg-card); padding:1rem; border-radius:1rem; cursor:pointer; border:1px solid var(--border);">' +
                '<h4 style="margin-bottom:0.5rem;">' + i.title + '</h4>' +
                '<small style="color:var(--text-dim);">' + i.pubDate + '</small>' +
                '</div>'
            ).join('');
            document.getElementById('news-list').innerHTML = h;
        }
    } catch (e) { debugLog('WARN Haberler y\u00fcklenemedi: ' + e.message); }
}

function handleImageError(img, code) {
    img.style.display = 'none';
    img.parentNode.innerHTML = '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#444; color:#fff; font-size:10px; border-radius:50%;">' + code.substring(0, 2) + '</div>';
}
