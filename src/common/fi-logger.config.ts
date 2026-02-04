const utils = require("@fintechinnovaciondev/fi-utils");

// Parametrización del logger
utils.logger.set(
    {
        console: {
            active: process.env.LOGGING_TRANSPORTS_CONSOLE === 'true',
            level: process.env.LOGGING_LEVEL_CONSOLE || 'info',
            json: process.env.LOGGING_JSON_CONSOLE === 'true',
            color: true,
        },
        file: {
            active: process.env.LOGGING_TRANSPORTS_FILE === 'true',
            level: process.env.LOGGING_LEVEL_FILE || 'info',
            dailyRotate: process.env.LOGGING_TRANSPORTS_DAILY_ROTATE === 'true',
            path: process.env.LOGGING_FILE_PATH || 'logs',
            name: process.env.LOGGING_FILE_NAME || 'app',
            maxSize: process.env.LOGGING_FILE_MAXSIZE || '20m',
            pattern: process.env.LOGGING_FILE_PATTERN || 'YYYY-MM-DD',
        },
    },
    {
        idReq: {
            format: "uuid"
        },
    }
);

// Configuramos el middleware como en tu ejemplo de Express
utils.middleware.config({
    appendTo: "res.locals",
    logName: "log"
});

export const fiUtils = utils;
export const defaultLogger = utils.logger.get();
