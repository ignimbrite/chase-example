const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const API_KEY = process.env.API_KEY;
const SECRET_KEY = process.env.SECRET_KEY;
const BASE_URL = process.env.TESTNET === 'true'
    ? 'https://testnet.binancefuture.com'
    : 'https://fapi.binance.com';

function generateQueryString(params) {
    return Object.keys(params)
        .map(key => `${key}=${params[key]}`)
        .join('&');
}

function generateSignature(queryString, secret) {
    return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

async function httpCall(method, endpoint, params = {}) {
    const queryString = generateQueryString(params);
    const signature = generateSignature(queryString, SECRET_KEY);
    const url = `${BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

    const headers = {
        'X-MBX-APIKEY': API_KEY,
    };

    const config = { method, url, headers };

    try {
        const response = await axios(config);
        return response.data;
    } catch (error) {
        console.error(`[ERROR] API call failed: ${error?.response?.data?.msg || error?.response}`);
        throw error;
    }
}

async function getListenKey() {
    const response = await httpCall('post', '/fapi/v1/listenKey');
    return response.listenKey;
}

async function keepListenKeyAlive() {
    await httpCall('put', '/fapi/v1/listenKey');
    console.log('[INFO] ListenKey validity extended.');
}

async function placeLimitOrder(symbol, price, quantity, side) {
    const params = {
        symbol,
        side,
        type: 'LIMIT',
        timeInForce: 'GTX',
        quantity,
        price,
        timestamp: Date.now(),
    };
    return httpCall('post', '/fapi/v1/order', params);
}

async function cancelOrder(symbol, orderId) {
    const params = {
        symbol,
        orderId,
        timestamp: Date.now(),
    };
    return httpCall('delete', '/fapi/v1/order', params);
}

async function getTradingRules(symbol) {
    const exchangeInfo = await httpCall('get', '/fapi/v1/exchangeInfo');
    const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === symbol);
    if (!symbolInfo) {
        throw new Error(`Trading rules for symbol ${symbol} not found.`);
    }

    const priceFilter = symbolInfo.filters.find(filter => filter.filterType === 'PRICE_FILTER');

    return {
        tickSize: parseFloat(priceFilter?.tickSize || 0),
    };
}

module.exports = {
    getListenKey,
    keepListenKeyAlive,
    placeLimitOrder,
    cancelOrder,
    getTradingRules,
};
