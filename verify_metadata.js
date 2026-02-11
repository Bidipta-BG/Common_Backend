const http = require('http');

const PORT = 3000;
const BASE_PATH = '/api/greeting-app';

function request(method, path) {
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
        req.end();
    });
}

async function runTests() {
    console.log('--- Starting App Metadata Verification ---');

    try {
        // 1. GET Languages and check Metadata
        console.log('\n[TEST 1] Fetching Languages with Metadata...');
        const getRes = await request('GET', '/languages');
        console.log('Status:', getRes.status);

        if (getRes.status === 200) {
            console.log('SUCCESS: Languages fetched.');

            if (getRes.body.metadata) {
                console.log('SUCCESS: Metadata field exists:', getRes.body.metadata);
                if (getRes.body.metadata.androidMinVersion === "1.0.3") {
                    console.log('SUCCESS: Default version correct (1.0.3).');
                } else {
                    console.log('NOTE: Version is different (database might already have data).', getRes.body.metadata.androidMinVersion);
                }
            } else {
                console.error('FAILURE: Metadata field is MISSING in response.', getRes.body);
            }
        } else {
            console.error('FAILURE: GET request failed.', getRes.body);
        }
    } catch (err) {
        console.error('ERROR: Is the server running?', err.message);
    }
    console.log('\n--- Verification Finished ---');
}

runTests();
