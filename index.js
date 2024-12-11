const { getListenKey, keepListenKeyAlive, placeLimitOrder, cancelOrder, getTradingRules } = require('./binance/binanceApi');
const { connectUserDataStream, connectMarketDataStream } = require('./binance/binanceWs');

const SYMBOL = process.env.SYMBOL;
const ORDER_QTY = parseFloat(process.env.ORDER_QTY);
const PRICE_OFFSET = parseFloat(process.env.PRICE_OFFSET);
const CHASE_SIDE = process.env.CHASE_SIDE;

const orderState = {
    currentOrderId: null,
    currentOrderPrice: null,
    remainingQuantity: ORDER_QTY,
    orderFilled: false,
    isUpdatingOrder: false,
};

(async () => {
    const { tickSize, stepSize } = await getTradingRules(SYMBOL);

    function roundToTickSize(price) {
        return parseFloat((Math.floor(price / tickSize) * tickSize).toFixed(tickSize.toString().split('.')[1]?.length || 0));
    }

    function roundToStepSize(quantity) {
        return parseFloat((Math.floor(quantity / stepSize) * stepSize).toFixed(stepSize.toString().split('.')[1]?.length || 0));
    }

    const listenKey = await getListenKey();
    let userDataWs;
    let marketDataWs;

    function cleanUp() {
        console.log("[INFO] Cleaning up connections...");
        userDataWs?.close();
        marketDataWs?.close();
        process.exit(0);
    }

    userDataWs = connectUserDataStream(
        listenKey,
        (msg) => {
            const data = JSON.parse(msg);
            if (data.e === 'ORDER_TRADE_UPDATE' && data.o.i === orderState.currentOrderId) {
                const filledQty = parseFloat(data.o.l);
                const cumulativeQty = parseFloat(data.o.z);

                if (data.o.X === 'FILLED') {
                    console.log(`[FILLED] Order #${orderState.currentOrderId} fully filled.`);
                    orderState.remainingQuantity = 0;
                    orderState.orderFilled = true;
                    cleanUp();
                } else if (data.o.X === 'PARTIALLY_FILLED') {
                    orderState.remainingQuantity = ORDER_QTY - cumulativeQty;
                    console.log(`[PARTIAL] Order #${orderState.currentOrderId} partially filled. Filled: ${filledQty}, Remaining: ${orderState.remainingQuantity}`);

                    if (orderState.remainingQuantity <= 0) {
                        console.log("[INFO] All quantity filled.");
                        orderState.orderFilled = true;
                        cleanUp();
                    }
                }
            }
        },
        (err) => console.error("[WS] User Data Stream Error:", err),
        () => console.log("[WS] User Data Stream Closed.")
    );


    marketDataWs = connectMarketDataStream(
        SYMBOL,
        async (msg) => {
            const data = JSON.parse(msg);
            const bestBid = parseFloat(data.b);
            const bestAsk = parseFloat(data.a);

            const desiredPrice = roundToTickSize(
                CHASE_SIDE === 'BUY' ? bestBid - PRICE_OFFSET : bestAsk + PRICE_OFFSET
            );



            const roundedQuantity = roundToStepSize(orderState.remainingQuantity);

            if (orderState.isUpdatingOrder || orderState.orderFilled) {
                return;
            }

            if (!orderState.currentOrderId) {
                console.log(`[TRADE] Placing initial ${CHASE_SIDE} order @ ${desiredPrice} with quantity ${roundedQuantity}`);
                orderState.isUpdatingOrder = true;

                try {
                    const orderResponse = await placeLimitOrder(SYMBOL, desiredPrice, roundedQuantity, CHASE_SIDE);
                    orderState.currentOrderId = orderResponse.orderId;
                    orderState.currentOrderPrice = desiredPrice;
                    console.log(`[SUCCESS] Order #${orderState.currentOrderId} placed @ ${desiredPrice} with quantity ${roundedQuantity}`);
                } catch (error) {
                    console.error("[ERROR] Failed to place initial order:", error?.response?.data?.msg || error?.response);
                } finally {
                    orderState.isUpdatingOrder = false;
                }

                return;
            }

            if (orderState.currentOrderPrice !== desiredPrice) {
                console.log(`[TRADE] Canceling order #${orderState.currentOrderId} and placing new order @ ${desiredPrice} with quantity ${roundedQuantity}`);
                orderState.isUpdatingOrder = true;

                try {
                    await cancelOrder(SYMBOL, orderState.currentOrderId);
                    console.log(`[INFO] Order #${orderState.currentOrderId} canceled successfully.`);

                    const orderResponse = await placeLimitOrder(SYMBOL, desiredPrice, roundedQuantity, CHASE_SIDE);
                    orderState.currentOrderId = orderResponse.orderId;
                    orderState.currentOrderPrice = desiredPrice;
                    console.log(`[TRADE] New order #${orderState.currentOrderId} placed @ ${desiredPrice} with quantity ${roundedQuantity}`);
                } catch (error) {
                    console.error("[ERROR] Failed to update order:", error?.response?.data?.msg || error?.response);
                } finally {
                    orderState.isUpdatingOrder = false;
                }
            }
        },
        (err) => console.error("[WS] Market Data Stream Error:", err),
        () => console.log("[WS] Market Data Stream Closed.")
    );

    setInterval(async () => {
        try {
            await keepListenKeyAlive();
        } catch (error) {
            console.error('[ERROR] Unable to keep listenKey alive:', error?.response?.data?.msg || error?.response);
        }
    }, 30 * 60 * 1000);

    process.on('SIGINT', () => {
        console.log("[INFO] Received SIGINT. Exiting...");
        cleanUp();
    });

    process.on('uncaughtException', (err) => {
        console.error("[ERROR] Uncaught exception:", err);
        cleanUp();
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error("[ERROR] Unhandled rejection at:", promise, "reason:", reason);
        cleanUp();
    });
})();
