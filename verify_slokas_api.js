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

async function verifySlokas() {
    console.log('Step 1: Adding a new Featured Sloka...');
    const sloka1 = {
        chapter: "Chapter 2, Verse 47",
        sans: "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।",
        en: {
            text: "You have a right to perform your prescribed duty...",
            meaning: "Focus on your work, not the results."
        },
        hi: {
            text: "तुम्हारा अधिकार केवल कर्म करने में है...",
            meaning: "अपने कर्म पर ध्यान दो, परिणाम पर नहीं।"
        },
        isFeatured: true
    };

    const res1 = await sendRequest('POST', '/api/srikrishna-aarti/daily-slokas', sloka1);
    console.log('Post 1 Status:', res1.status);
    const slokaId1 = res1.body.data._id;

    console.log('\nStep 2: Adding a second Sloka (not featured)...');
    const sloka2 = {
        chapter: "Chapter 4, Verse 7",
        sans: "यदा यदा हि धर्मस्य ग्लानिर्भवति भारत।",
        en: {
            text: "Whenever there is a decline in righteousness...",
            meaning: "God descends when Dharma needs protection."
        },
        hi: {
            text: "जब-जब धर्म की हानि और अधर्म की वृद्धि होती है...",
            meaning: "धर्म की रक्षा के लिए भगवान अवतार लेते हैं।"
        },
        isFeatured: false
    };

    const res2 = await sendRequest('POST', '/api/srikrishna-aarti/daily-slokas', sloka2);
    console.log('Post 2 Status:', res2.status);

    console.log('\nStep 3: Fetching All Slokas...');
    const res3 = await sendRequest('GET', '/api/srikrishna-aarti/daily-slokas');
    console.log('Get Status:', res3.status);
    console.log('Featured Sloka ID:', res3.body.data.featuredSloka.id);
    console.log('Total Slokas:', res3.body.data.allSlokas.length);

    if (res3.body.data.featuredSloka.id === slokaId1) {
        console.log('\n✓ SUCCESS: Slokas recorded and retrieved correctly.');
    } else {
        console.log('\n✗ FAILURE: Data mismatch.');
    }
}

verifySlokas().catch(err => {
    console.error('Error during verification:', err.message);
    console.log('NOTE: Make sure the server is running on port 3000.');
});
