const http = require('http');

async function sendRequest(payload) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/srikrishna-aarti/astro-interest',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, body: JSON.parse(body) });
            });
        });

        req.on('error', (err) => reject(err));
        req.write(data);
        req.end();
    });
}

async function verifyUniqueness() {
    const deviceId = "test_unique_device_" + Math.random().toString(36).substring(7);

    console.log(`Step 1: Sending first request for device: ${deviceId}`);
    const res1 = await sendRequest({
        interested: true,
        language: "en",
        timestamp: new Date().toISOString(),
        deviceId: deviceId
    });
    console.log('Response 1 Status:', res1.status);
    const id1 = res1.body.data._id;

    console.log(`\nStep 2: Sending second request for same device: ${deviceId} with updated intent`);
    const res2 = await sendRequest({
        interested: false,
        language: "hi",
        timestamp: new Date().toISOString(),
        deviceId: deviceId
    });
    console.log('Response 2 Status:', res2.status);
    const id2 = res2.body.data._id;

    console.log('\nResults:');
    console.log('ID 1:', id1);
    console.log('ID 2:', id2);

    if (id1 === id2) {
        console.log('\n✓ SUCCESS: Device ID matched existing record and performed an update.');
    } else {
        console.log('\n✗ FAILURE: Created a duplicate record for the same Device ID.');
    }
}

verifyUniqueness().catch(err => {
    console.error('Error during verification:', err.message);
    console.log('NOTE: Make sure the server is running on port 3000.');
});
