const http = require('http');

async function sendRequest(method, path, payload) {
    return new Promise((resolve, reject) => {
        const data = payload ? JSON.stringify(payload) : '';
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (data) {
            options.headers['Content-Length'] = data.length;
        }

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, body: body });
                }
            });
        });

        req.on('error', (err) => reject(err));
        if (data) req.write(data);
        req.end();
    });
}

async function verifyMantras() {
    console.log('Step 1: Adding a new Mantra...');
    const mantra = {
        title: "Om Shri Vardhanaya Namah",
        sans: "ॐ श्री वर्धनाय नमः",
        benefit: {
            en: "For success in career and growth.",
            hi: "करियर में सफलता और वृद्धि के लिए।"
        },
        details: {
            en: "Chanting this mantra 108 times is believed to remove obstacles...",
            hi: "इस मंत्र का 108 बार जाप करने से व्यावसायिक जीवन में आने वाली बाधाएं..."
        },
        count: 108
    };

    const res1 = await sendRequest('POST', '/api/srikrishna-aarti/mantras', mantra);
    console.log('Post Status:', res1.status);

    if (res1.status !== 201) {
        console.log('Data:', res1.body);
        throw new Error('Post failed');
    }

    console.log('\nStep 2: Fetching All Mantras...');
    const res2 = await sendRequest('GET', '/api/srikrishna-aarti/mantras');
    console.log('Get Status:', res2.status);
    console.log('Total Mantras:', res2.body.data.length);

    if (res2.status === 200 && res2.body.data.length > 0) {
        console.log('\n✓ SUCCESS: Mantras recorded and retrieved correctly.');
    } else {
        console.log('\n✗ FAILURE: Data mismatch or get failed.');
    }
}

verifyMantras().catch(err => {
    console.error('Error during verification:', err.name === 'Error' ? err.message : err);
    console.log('NOTE: Make sure the server is running on port 3000.');
});
