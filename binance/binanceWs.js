const WebSocket = require('ws');

require('dotenv').config();

const SYMBOL = process.env.SYMBOL;
const WS_BASE = process.env.TESTNET === 'true'
    ? 'wss://stream.binancefuture.com'
    : 'wss://fstream.binance.com';

function connectUserDataStream(listenKey, onMessage, onError, onClose) {
    const userDataWs = new WebSocket(`${WS_BASE}/ws/${listenKey}`);

    userDataWs.on('open', () => {
        console.log("[WS] Connected to User Data Stream.");
    });

    userDataWs.on('message', onMessage);

    userDataWs.on('error', onError);

    userDataWs.on('close', onClose);

    return userDataWs;
}

function connectMarketDataStream(symbol = SYMBOL, onMessage, onError, onClose) {
    const marketDataWs = new WebSocket(`${WS_BASE}/ws/${symbol.toLowerCase()}@bookTicker`);

    marketDataWs.on('open', () => {
        console.log(`[WS] Connected to Market Data WebSocket for ${symbol}.`);
    });

    marketDataWs.on('message', onMessage);

    marketDataWs.on('error', onError);

    marketDataWs.on('close', onClose);

    return marketDataWs;
}

module.exports = {
    connectUserDataStream,
    connectMarketDataStream,
};
