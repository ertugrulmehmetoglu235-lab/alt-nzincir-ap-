const https = require('https');

function fetchJSON(url) {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

async function debug() {
    const data = await fetchJSON('https://finans.truncgil.com/today.json');
    if (data) {
        console.log('Truncgil Keys:', Object.keys(data).slice(0, 50));
        console.log('Sample Item (gram-altin):', data['gram-altin']);
        console.log('Sample Item (GRA):', data['GRA']);
        console.log('Sample Item (Gram Altın):', data['Gram Altın']);
        console.log('Sample Item (ons):', data['ons']);
        console.log('Sample Item (ONS):', data['ONS']);
    } else {
        console.log('Failed to fetch Truncgil');
    }
}

debug();
