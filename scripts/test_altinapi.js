/**
 * test_altinapi.js — AltinAPI bağlantı ve sembol testi
 * Çalıştır: node scripts/test_altinapi.js
 */

const https = require('https');

const API_KEY = 'hapi_524b1663914e453ca777773d9c860833';
const BASE_URL = 'altinapi.com';

const ENDPOINTS = [
    '/api/v1/prices',
    '/api/v1/latest',
    '/api/v1/symbols',
    '/api/v1/all',
    '/api/prices',
    '/api/latest',
    '/api/symbols',
    '/v1/prices',
];

function fetchJson(path) {
    return new Promise(resolve => {
        const options = {
            hostname: BASE_URL,
            path,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'X-API-Key': API_KEY,
                'apiKey': API_KEY,
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json',
            }
        };
        const req = https.request(options, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                resolve({ status: res.statusCode, body: raw.slice(0, 500) });
            });
        });
        req.on('error', e => resolve({ status: 0, body: e.message }));
        req.setTimeout(8000, () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
        req.end();
    });
}

async function run() {
    console.log('=== AltinAPI Endpoint Tarama ===\n');
    for (const ep of ENDPOINTS) {
        const { status, body } = await fetchJson(ep);
        const preview = body.replace(/\s+/g, ' ').slice(0, 120);
        console.log(`[${status}] ${ep}`);
        if (status === 200) {
            console.log(`  ✅ BAŞARILI! Preview: ${preview}`);
            // Tam sonucu göster
            console.log('\n=== TAM YANIT ===');
            const { body: full } = await fetchJson(ep);
            try {
                const json = JSON.parse(full);
                console.log(JSON.stringify(json, null, 2).slice(0, 3000));
            } catch {
                console.log(full);
            }
            break;
        } else {
            console.log(`  → ${preview}`);
        }
    }
}

run();
