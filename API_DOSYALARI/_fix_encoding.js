/**
 * _fix_encoding.js
 * data.json içindeki bozuk Türkçe karakterleri düzeltir ve hisse- kayıtlarını siler.
 * Çalıştır: node API_DOSYALARI/_fix_encoding.js
 */
const fs = require('fs');
const FILE = 'API_DOSYALARI/data.json';

// Bozuk UTF-8 → Doğru Türkçe karakter haritası (Latin-1 → UTF-8 dönüşümü)
const FIX_MAP = [
    [/Ä±/g, 'ı'], [/Ä°/g, 'İ'], [/Å/g, 'Ş'], [/ÅŸ/g, 'ş'],
    [/Ã¼/g, 'ü'], [/Ã¼/g, 'ü'], [/Ãœ/g, 'Ü'], [/Ã¶/g, 'ö'],
    [/Ã–/g, 'Ö'], [/Ã§/g, 'ç'], [/Ã‡/g, 'Ç'], [/Äž/g, 'Ğ'],
    [/ÄŸ/g, 'ğ'], [/â€"/g, '—'], [/â‚º/g, '₺'],
    [/Ä±/g, 'ı'], [/Ã‚/g, ''], [/Â/g, ''],
    // Common broken patterns seen in screenshot
    [/DolarÄ±/g, 'Doları'], [/Sterlini/gi, 'Sterlini'],
    [/Ä°ngiliz/g, 'İngiliz'], [/Ä°sviÃ§re/g, 'İsviçre'],
    [/Ä°sveÃ§/g, 'İsveç'], [/NorveÃ§/g, 'Norveç'],
    [/GÃ¼ney/g, 'Güney'], [/Kuveyt/g, 'Kuveyt'],
    [/Azerbaycan ManatÄ±/g, 'Azerbaycan Manatı'],
    [/Bulgar LevasÄ±/g, 'Bulgar Levası'],
    [/Cezayir DinarÄ±/g, 'Cezayir Dinarı'],
    [/Singapur DolarÄ±/g, 'Singapur Doları'],
    [/Hong Kong DolarÄ±/g, 'Hong Kong Doları'],
    [/Meksika Pesosu/g, 'Meksika Pesosu'],
    [/Brezilya Reali/g, 'Brezilya Reali'],
    [/GÃ¼ney Afrika RandÄ±/g, 'Güney Afrika Randı'],
    [/Umman Riyali/g, 'Umman Riyali'],
    [/Katar Riyali/g, 'Katar Riyali'],
    [/Danimarka Kronu/g, 'Danimarka Kronu'],
];

// Doğru isimler haritası (key → name)
const CORRECT_NAMES = {
    'USD': 'ABD Doları', 'EUR': 'Euro', 'GBP': 'İngiliz Sterlini',
    'JPY': 'Japon Yeni', 'CHF': 'İsviçre Frangı', 'CAD': 'Kanada Doları',
    'AUD': 'Avustralya Doları', 'SAR': 'Suudi Riyali', 'RUB': 'Rus Rublesi',
    'KWD': 'Kuveyt Dinarı', 'AZN': 'Azerbaycan Manatı', 'BGN': 'Bulgar Levası',
    'NOK': 'Norveç Kronu', 'SEK': 'İsveç Kronu', 'DKK': 'Danimarka Kronu',
    'DZD': 'Cezayir Dinarı', 'QAR': 'Katar Riyali', 'OMR': 'Umman Riyali',
    'SGD': 'Singapur Doları', 'HKD': 'Hong Kong Doları', 'MXN': 'Meksika Pesosu',
    'BRL': 'Brezilya Reali', 'ZAR': 'Güney Afrika Randı',
    'AED': 'BAE Dirhemi', 'BHD': 'Bahreyn Dinarı', 'LYD': 'Libya Dinarı',
    'IQD': 'Irak Dinarı', 'ILS': 'İsrail Şekeli', 'INR': 'Hindistan Rupisi',
    'gram-altin': 'Gram Altın', 'ons': 'Ons Altın', 'ceyrek-altin': 'Çeyrek Altın',
    'yarim-altin': 'Yarım Altın', 'tam-altin': 'Tam Altın',
    'cumhuriyet-altini': 'Cumhuriyet Altını', 'ata-altin': 'Ata Altın',
    'resat-altin': 'Reşat Altın', 'hamit-altin': 'Hamit Altın',
    'besli-altin': 'Beşli Altın', 'gremse-altin': 'Gremse Altın',
    'ikibucuk-altin': 'İkibuçuk Altın', 'gram-has-altin': 'Gram Has Altın',
    '14-ayar-altin': '14 Ayar Altın', '18-ayar-altin': '18 Ayar Altın',
    '22-ayar-bilezik': '22 Ayar Bilezik',
    'gumus': 'Gümüş', 'gram-platin': 'Gram Platin', 'gram-paladyum': 'Gram Paladyum',
    'emtia-cl': 'Ham Petrol (WTI)', 'emtia-bz': 'Brent Petrol',
    'emtia-ng': 'Doğalgaz', 'emtia-hg': 'Bakır', 'emtia-zw': 'Buğday',
    'emtia-kc': 'Kahve', 'emtia-co': 'Kakao',
};

try {
    const raw = fs.readFileSync(FILE, 'utf8');
    let data = JSON.parse(raw);

    let fixed = 0;
    let deleted = 0;

    Object.keys(data).forEach(key => {
        // Hisse kayıtlarını sil
        if (key.startsWith('hisse-')) {
            delete data[key];
            console.log(`🗑️  Silindi: ${key}`);
            deleted++;
            return;
        }

        // İsmi doğrudan düzelt (haritadan bul)
        if (CORRECT_NAMES[key] && data[key].name !== CORRECT_NAMES[key]) {
            console.log(`✏️  Düzeltildi: ${key}: "${data[key].name}" → "${CORRECT_NAMES[key]}"`);
            data[key].name = CORRECT_NAMES[key];
            fixed++;
        } else if (data[key].name) {
            // Genel FIX_MAP uygula
            let orig = data[key].name;
            let newName = orig;
            FIX_MAP.forEach(([from, to]) => { newName = newName.replace(from, to); });
            if (newName !== orig) {
                console.log(`✏️  Encoding fix: ${key}: "${orig}" → "${newName}"`);
                data[key].name = newName;
                fixed++;
            }
        }
    });

    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log(`\n✅ Tamamlandı!`);
    console.log(`   ${deleted} hisse kaydı silindi.`);
    console.log(`   ${fixed} isim düzeltildi.`);
    console.log(`   Kalan varlık: ${Object.keys(data).length}`);
} catch (e) {
    console.error('❌ Hata:', e.message);
}
