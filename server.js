require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 3000;

// Connect to Database
connectDB();

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    
    // Load Tranco high-traffic site list for URL validation
    // try {
    //   const { loadTrancoList } = require('./src/apps/ai-business-analyzer/utils/urlValidator');
    //   loadTrancoList(10000).catch(err =>
    //     console.warn('[TRANCO] Failed to load, falling back to manual blocklist:', err.message)
    //   );
    //   
    //   // Refresh Tranco list weekly
    //   setInterval(
    //     () => loadTrancoList(10000).catch(err => console.warn('[TRANCO] Weekly refresh failed:', err.message)),
    //     7 * 24 * 60 * 60 * 1000
    //   );
    // } catch (err) {
    //   console.warn('Could not initialize Tranco list.', err);
    // }
});