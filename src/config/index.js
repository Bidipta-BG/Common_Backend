module.exports = {
    port: process.env.PORT || 3000,
    dbUri: process.env.MONGODB_URI,
    env: process.env.NODE_ENV || 'development'
};