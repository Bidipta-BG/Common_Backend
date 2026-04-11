const fs = require('fs');
const content = fs.readFileSync('c:/Users/bidip/Documents/PROJECTS/Common_Backend/src/apps/phesa/controllers/widgetController.js', 'utf8');

function checkBraces(text) {
    let stack = [];
    let line = 1;
    let col = 0;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '\n') {
            line++;
            col = 0;
        } else {
            col++;
        }
        
        if (char === '{') stack.push({ char, line, col });
        else if (char === '}') {
            if (stack.length === 0) {
                console.log(`Extra closing brace at ${line}:${col}`);
            } else {
                stack.pop();
            }
        }
    }
    
    if (stack.length > 0) {
        console.log(`${stack.length} unclosed braces. First one at ${stack[0].line}:${stack[0].col}`);
    } else {
        console.log("Braces are balanced.");
    }
}

checkBraces(content);
