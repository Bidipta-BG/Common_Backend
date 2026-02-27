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
            options.headers['Content-Length'] = Buffer.byteLength(data);
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

async function verifySlokas() {
    console.log('Step 1: Adding a new Sloka...');
    const sloka = {
        chapter: "Chapter 1, Verse 1",
        sans: "धर्मक्षेत्रे कुरुक्षेत्रे...",
        en: {
            text: "On the holy field of Kurukshetra...",
            meaning: "Dharmakshetra is Kurukshetra..."
        },
        hi: {
            text: "धर्मक्षेत्र कुरुक्षेत्र में...",
            meaning: "धर्मक्षेत्र कुरुक्षेत्र में..."
        },
        isFeatured: true,
        image: "https://example.com/sloka-image.jpg",
        music: "https://example.com/sloka-music.mp3"
    };

    const res1 = await sendRequest('POST', '/api/srikrishna-aarti/daily-slokas', sloka);
    console.log('Post Status:', res1.status);

    if (res1.status !== 201) {
        console.log('Data:', res1.body);
        throw new Error('Post failed');
    }

    console.log('\nStep 2: Fetching Daily Slokas...');
    const res2 = await sendRequest('GET', '/api/srikrishna-aarti/daily-slokas');
    console.log('Get Status:', res2.status);

    if (res2.status === 200) {
        const featured = res2.body.data.featuredSloka;
        console.log('Featured Sloka Image:', featured.image);
        console.log('Featured Sloka Music:', featured.music);

        if (featured.image === sloka.image && featured.music === sloka.music) {
            console.log('\n✓ SUCCESS: Sloka recorded and retrieved correctly with image/music.');
        } else {
            console.log('\n✗ FAILURE: Data mismatch.');
        }
    } else {
        console.log('\n✗ FAILURE: Get failed.');
    }
}

verifySlokas().catch(err => {
    console.error('Error during verification:', err.name === 'Error' ? err.message : err);
    console.log('NOTE: Make sure the server is running on port 3000.');
});
