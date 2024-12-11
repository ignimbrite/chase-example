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
    const { tickSize } = await getTradingRules(SYMBOL);

    function roundToTickSize(price) {
        return parseFloat((Math.floor(price / tickSize) * tickSize).toFixed(tickSize.toString().split('.')[1]?.length || 0));
    }

    const listenKey = await getListenKey();

    const userDataWs = connectUserDataStream(
        listenKey,
        (msg) => {
            const data = JSON.parse(msg);
            if (data.e === 'ORDER_TRADE_UPDATE' && data.o.i === orderState.currentOrderId) {
                if (data.o.X === 'FILLED') {
                    console.log(`[FILLED] Order #${orderState.currentOrderId} filled.`);
                    orderState.orderFilled = true;
                    userDataWs.close();
                    process.exit(0);
                } else if (data.o.X === 'PARTIALLY_FILLED') {
                    const filledQty = parseFloat(data.o.l);
                    orderState.remainingQuantity -= filledQty;
                    if (orderState.remainingQuantity <= 0) {
                        console.log("[INFO] All quantity filled.");
                        orderState.orderFilled = true;
                        userDataWs.close();
                        process.exit(0);
                    }
                }
            }
        },
        (err) => console.error("[WS] User Data Stream Error:", err),
        () => console.log("[WS] User Data Stream Closed.")
    );

    connectMarketDataStream(
        SYMBOL,
        async (msg) => {
            const data = JSON.parse(msg);
            const bestBid = parseFloat(data.b);
            const bestAsk = parseFloat(data.a);

            const desiredPrice = roundToTickSize(
                CHASE_SIDE === 'BUY' ? bestBid - PRICE_OFFSET : bestAsk + PRICE_OFFSET
            );

            if (orderState.isUpdatingOrder || orderState.orderFilled) {
                return;
            }

            if (!orderState.currentOrderId) {
                console.log(`[TRADE] Placing initial ${CHASE_SIDE} order @ ${desiredPrice}`);
                orderState.isUpdatingOrder = true;

                try {
                    const orderResponse = await placeLimitOrder(SYMBOL, desiredPrice, orderState.remainingQuantity, CHASE_SIDE);
                    orderState.currentOrderId = orderResponse.orderId;
                    orderState.currentOrderPrice = desiredPrice;
                    console.log(`[SUCCESS] Order #${orderState.currentOrderId} placed @ ${desiredPrice}`);
                } catch (error) {
                    console.error("[ERROR] Failed to place initial order:", error?.response?.data?.msg || error?.response);
                } finally {
                    orderState.isUpdatingOrder = false;
                }

                return;
            }

            if (orderState.currentOrderPrice !== desiredPrice) {
                console.log(`[TRADE] Canceling order #${orderState.currentOrderId} and placing new order @ ${desiredPrice}`);
                orderState.isUpdatingOrder = true;

                try {
                    await cancelOrder(SYMBOL, orderState.currentOrderId);
                    console.log(`[INFO] Order #${orderState.currentOrderId} canceled successfully.`);

                    const orderResponse = await placeLimitOrder(SYMBOL, desiredPrice, orderState.remainingQuantity, CHASE_SIDE);
                    orderState.currentOrderId = orderResponse.orderId;
                    orderState.currentOrderPrice = desiredPrice;
                    console.log(`[TRADE] New order #${orderState.currentOrderId} placed @ ${desiredPrice}`);
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
})();
