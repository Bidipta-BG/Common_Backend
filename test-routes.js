// Quick test to verify routes are registered
require('dotenv').config();
const app = require('./src/app');

console.log('\n=== Testing Route Registration ===\n');

// Start a test server
const server = app.listen(3001, () => {
    console.log('Test server started on port 3001');

    // Make a test request
    const http = require('http');

    http.get('http://localhost:3001/api/health', (res) => {
        console.log(`✓ Health check: ${res.statusCode}`);

        http.get('http://localhost:3001/api/srikrishna-aarti/gallery', (res2) => {
            let data = '';
            res2.on('data', chunk => data += chunk);
            res2.on('end', () => {
                console.log(`✓ Gallery endpoint: ${res2.statusCode}`);
                if (res2.statusCode === 200) {
                    console.log('Response:', JSON.parse(data));
                } else {
                    console.log('Response:', data);
                }
                server.close();
                process.exit(0);
            });
        }).on('error', (e) => {
            console.error('✗ Gallery endpoint error:', e.message);
            server.close();
            process.exit(1);
        });
    }).on('error', (e) => {
        console.error('✗ Health check error:', e.message);
        server.close();
        process.exit(1);
    });
});
