const utils = require("@fintechinnovaciondev/fi-utils");
console.log("Type of utils.middleware:", typeof utils.middleware);
console.log("Keys of utils.middleware:", Object.keys(utils.middleware || {}));
if (typeof utils.middleware === 'object') {
    for (const key in utils.middleware) {
        console.log(`- ${key}: ${typeof utils.middleware[key]}`);
    }
}
