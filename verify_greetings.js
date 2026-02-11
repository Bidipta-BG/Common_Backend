const http = require('http');

const PORT = 3000;
const BASE_PATH = '/api/greeting-app';

const templateData = {
    imageUrl: "https://example.com/test-greeting.jpg",
    category: "good_morning",
    language: "en",
    tags: ["test", "template"],
    isTemplate: true,
    textLayers: [
        {
            id: "layer_test",
            text: "Hello World",
            x: 50,
            y: 50,
            fontSize: 24,
            color: "#000000",
            fontFamily: "System"
        }
    ]
};

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: PORT,
            path: `${BASE_PATH}${path}`,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runTests() {
    console.log('--- Starting Greeting App Verification ---');

    try {
        // 1. POST Create Greeting
        console.log('\n[TEST 1] Creating Template Greeting...');
        const createRes = await request('POST', '/images', templateData);
        console.log('Status:', createRes.status);

        if (createRes.status === 201) {
            console.log('SUCCESS: Template Greeting created.');
            const greetingId = createRes.body.data._id;

            // 2. GET Greetings by Category/Language
            console.log('\n[TEST 2] Fetching Greetings (good_morning, en)...');
            const getRes = await request('GET', '/images?category=good_morning&language=en');
            console.log('Status:', getRes.status);

            if (getRes.status === 200) {
                const found = getRes.body.data.find(g => g._id === greetingId);
                if (found && found.isTemplate === true && found.textLayers.length > 0) {
                    console.log('SUCCESS: New fields isTemplate and textLayers verified in GET response.');
                } else {
                    console.error('FAILURE: New fields missing or incorrect in GET response.', found);
                }
            } else {
                console.error('FAILURE: GET request failed.', getRes.body);
            }
        } else {
            console.error('FAILURE: POST request failed.', createRes.body);
        }
    } catch (err) {
        console.error('ERROR: Is the server running?', err.message);
    }
    console.log('\n--- Verification Finished ---');
}

runTests();
