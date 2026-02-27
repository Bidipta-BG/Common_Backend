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

async function verifyGranthSystem() {
    console.log('Testing Granth Study System...');

    // 1. Post Granth
    console.log('\n1. Seeding Granth...');
    const granthRes = await sendRequest('POST', '/api/srikrishna-aarti/granth', {
        bookId: "bg",
        title: "Bhagavad Gita",
        titleHi: "श्रीमद्भगवद्गीता",
        description: "The song of God...",
        descriptionHi: "ईश्वर का गीत...",
        image_url: "https://cdn.example.com/assets/bg_cover.png"
    });
    console.log('Post Granth Status:', granthRes.status);

    // 2. Post Chapter
    console.log('\n2. Seeding Chapter...');
    const chapterRes = await sendRequest('POST', '/api/srikrishna-aarti/granth/chapter', {
        bookId: "bg",
        index: 1,
        title: "Arjuna Visada Yoga",
        titleHi: "अर्जुनविषादयोग"
    });
    console.log('Post Chapter Status:', chapterRes.status);

    // 3. Post Verse
    console.log('\n3. Seeding Verse...');
    const verseRes = await sendRequest('POST', '/api/srikrishna-aarti/granth/verse', {
        verseId: "bg_01_01",
        bookId: "bg",
        chapterIndex: 1,
        index: 1,
        chapterText: "Chapter 1, Verse 1",
        chapterTextHi: "अध्याय १, श्लोक १",
        sans: "धृतराष्ट्र उवाच |...",
        en: {
            text: "Dhritarashtra said...",
            meaning: "...",
            explanation: "...",
            lessons: "..."
        },
        hi: {
            text: "धृतराष्ट्र बोले...",
            meaning: "...",
            explanation: "...",
            lessons: "..."
        },
        timer: 180
    });
    console.log('Post Verse Status:', verseRes.status);

    // 4. Verify GET /granth
    console.log('\n4. Verifying GET /granth...');
    const listRes = await sendRequest('GET', '/api/srikrishna-aarti/granth');
    console.log('Get List Status:', listRes.status);
    console.log('List Count:', listRes.body.length);

    // 5. Verify GET /granth/bg
    console.log('\n5. Verifying GET /granth/bg...');
    const treeRes = await sendRequest('GET', '/api/srikrishna-aarti/granth/bg');
    console.log('Get Tree Status:', treeRes.status);
    console.log('Chapters Count:', treeRes.body.chapters.length);
    console.log('First Verse ID:', treeRes.body.chapters[0].verses[0].id);

    // 6. Verify GET /granth/verse/bg_01_01
    console.log('\n6. Verifying GET /granth/verse/bg_01_01...');
    const detailRes = await sendRequest('GET', '/api/srikrishna-aarti/granth/verse/bg_01_01');
    console.log('Get Detail Status:', detailRes.status);
    console.log('Sans Text:', detailRes.body.sans);

    if (listRes.status === 200 && treeRes.status === 200 && detailRes.status === 200) {
        console.log('\n✅ SUCCESS: Granth Study System verified successfully!');
    } else {
        console.log('\n❌ FAILURE: API verification failed!');
    }
}

verifyGranthSystem().catch(console.error);
