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

async function testMantraFields() {
    console.log('Testing Mantra Fields...');
    const testMantra = {
        title: "Test Mantra " + Date.now(),
        sans: "ॐ टेस्ट मंत्र",
        benefit: {
            en: "Test benefit",
            hi: "टेस्ट बेनिफिट"
        },
        details: {
            en: "Test details",
            hi: "टेस्ट डिटेल्स"
        },
        count: 108,
        image: "https://example.com/image.jpg",
        music: "https://example.com/music.mp3"
    };

    console.log('1. Posting new mantra...');
    const postRes = await sendRequest('POST', '/api/srikrishna-aarti/mantras', testMantra);
    console.log('Post Status:', postRes.status);
    console.log('Post Body:', JSON.stringify(postRes.body, null, 2));

    if (postRes.status !== 201) {
        console.error('Post failed!');
        return;
    }

    console.log('\n2. Fetching mantras...');
    const getRes = await sendRequest('GET', '/api/srikrishna-aarti/mantras');
    console.log('Get Status:', getRes.status);

    const savedMantra = getRes.body.data.find(m => m.title === testMantra.title);
    if (savedMantra) {
        console.log('\nSaved Mantra found:');
        console.log('Image:', savedMantra.image);
        console.log('Music:', savedMantra.music);

        if (savedMantra.image === testMantra.image && savedMantra.music === testMantra.music) {
            console.log('\n✅ SUCCESS: Fields are working correctly!');
        } else {
            console.log('\n❌ FAILURE: Fields mismatch!');
        }
    } else {
        console.log('\n❌ FAILURE: Saved mantra not found in list!');
    }
}

testMantraFields().catch(console.error);
