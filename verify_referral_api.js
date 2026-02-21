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

async function verifyReferralSystem() {
    const userA_ID = "USER_A_" + Math.random().toString(36).substring(7);
    const userB_ID = "USER_B_" + Math.random().toString(36).substring(7);
    const userC_ID = "USER_C_" + Math.random().toString(36).substring(7);

    console.log('--- Step 1: Initialize User A and User B ---');
    const statusA = await sendRequest('GET', `/api/srikrishna-aarti/referral/status?deviceId=${userA_ID}`);
    const statusB = await sendRequest('GET', `/api/srikrishna-aarti/referral/status?deviceId=${userB_ID}`);

    const codeA = statusA.body.referralCode;
    const codeB = statusB.body.referralCode;
    console.log(`User A Code: ${codeA}`);
    console.log(`User B Code: ${codeB}`);

    console.log('\n--- Step 2: Guard 1 - Exist Check ---');
    const resExist = await sendRequest('POST', '/api/srikrishna-aarti/referral/redeem', {
        inviteCode: "INVALID-CODE",
        deviceId: userA_ID
    });
    console.log(`Redeem Invalid Result: ${resExist.status} - ${resExist.body.message}`);

    console.log('\n--- Step 3: Guard 2 - Self Check ---');
    const resSelf = await sendRequest('POST', '/api/srikrishna-aarti/referral/redeem', {
        inviteCode: codeA,
        deviceId: userA_ID
    });
    console.log(`Redeem Self Result: ${resSelf.status} - ${resSelf.body.message}`);

    console.log('\n--- Step 4: Successful Redemption (B redeems A) ---');
    const resSuccess = await sendRequest('POST', '/api/srikrishna-aarti/referral/redeem', {
        inviteCode: codeA,
        deviceId: userB_ID
    });
    console.log(`Redeem Success Result: ${resSuccess.status} - ${resSuccess.body.message}`);

    console.log('\n--- Step 5: Guard 3 - Double Redeem Check ---');
    const resDouble = await sendRequest('POST', '/api/srikrishna-aarti/referral/redeem', {
        inviteCode: codeA,
        deviceId: userB_ID // User B already redeemed a code
    });
    console.log(`Redeem Double Result: ${resDouble.status} - ${resDouble.body.message}`);

    console.log('\n--- Step 6: Guard 4 - Mutual Referral Check ---');
    // Initialize User C
    await sendRequest('GET', `/api/srikrishna-aarti/referral/status?deviceId=${userC_ID}`);
    // A redeems C (First directional referral)
    const statusC = await sendRequest('GET', `/api/srikrishna-aarti/referral/status?deviceId=${userC_ID}`);
    const codeC = statusC.body.referralCode;

    await sendRequest('POST', '/api/srikrishna-aarti/referral/redeem', {
        inviteCode: codeC,
        deviceId: userA_ID
    });

    // Now C tries to redeem A (Mutual referral)
    const resMutual = await sendRequest('POST', '/api/srikrishna-aarti/referral/redeem', {
        inviteCode: codeA,
        deviceId: userC_ID
    });
    console.log(`Redeem Mutual Result: ${resMutual.status} - ${resMutual.body.message}`);

    console.log('\n--- Step 7: Check Status & Claim Rewards ---');
    const statusAAfter = await sendRequest('GET', `/api/srikrishna-aarti/referral/status?deviceId=${userA_ID}`);
    console.log(`User A Pending Rewards: ${statusAAfter.body.pendingRewards}`);

    const resClaim = await sendRequest('POST', '/api/srikrishna-aarti/referral/claim', {
        deviceId: userA_ID
    });
    console.log(`Claim Result: ${resClaim.status} Status - Coins: ${resClaim.body.coinsAwarded}`);

    console.log('\n✓ Referral System Verification FINISHED');
}

verifyReferralSystem().catch(err => {
    console.error('Error during verification:', err.message);
    console.log('NOTE: Make sure the server is running on port 3000.');
});
