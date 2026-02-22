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

async function verifyVersionCheck() {
    console.log('--- Step 1: Initial Version Check (Default Values) ---');
    const res1 = await sendRequest('GET', '/api/srikrishna-aarti/system/version-check');
    console.log('Status:', res1.status);
    console.log('Data:', JSON.stringify(res1.body.data, null, 2));

    console.log('\n--- Step 2: Updating Configuration (Set Maintenance Mode ON) ---');
    const updatePayload = {
        latestVersion: "1.0.5",
        minRequiredVersion: "1.0.0",
        isForceUpdate: true,
        maintenanceMode: true,
        maintenanceMessage: "Divine Maintenance in progress..."
    };
    const res2 = await sendRequest('POST', '/api/srikrishna-aarti/system/version-check', updatePayload);
    console.log('Update Status:', res2.status);
    console.log('Message:', res2.body.message);

    console.log('\n--- Step 3: Verifying Updated Configuration ---');
    const res3 = await sendRequest('GET', '/api/srikrishna-aarti/system/version-check');
    console.log('Status:', res3.status);
    if (res3.body.data.maintenanceMode === true && res3.body.data.latestVersion === "1.0.5") {
        console.log('\n✓ SUCCESS: Version check and configuration update verified.');
    } else {
        console.log('\n✗ FAILURE: Data mismatch.');
    }
}

verifyVersionCheck().catch(err => {
    console.error('Error during verification:', err.message);
    console.log('NOTE: Make sure the server is running on port 3000.');
});
