require('dotenv').config();
const routes = require('./src/routes/index');

function printRoutes(stack, prefix = '') {
    stack.forEach(layer => {
        if (layer.route) {
            const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
            console.log(`  ${methods.padEnd(6)} ${prefix}${layer.route.path}`);
        } else if (layer.handle && layer.handle.stack) {
            // Extract path prefix from regexp
            const reg = layer.regexp.source;
            const match = reg.match(/\^\\\/([^\\?]+)/);
            const sub = match ? prefix + '/' + match[1].replace(/\\\//g, '/') : prefix;
            printRoutes(layer.handle.stack, sub);
        }
    });
}

console.log('=== Registered Routes ===');
printRoutes(routes.stack);
console.log('=========================');
process.exit(0);
