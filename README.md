# chase-example

This repository provides an example implementation of a chase limit function for Binance Futures USDⓈ-M. The bot dynamically adjusts limit orders to "chase" the top of the order book within a defined offset.

## Supported Modes
The bot supports the following configurations:
- **Account Mode**: Classic Trading
- **Position Mode**: One-Way
- **Asset Mode**:
    - Single-Asset
    - Multi-Assetss

## Installation
1. Clone the repository
   ```bash
   git clone git@github.com:ignimbrite/chase-example.git
   cd chase-example
    ```
2. Install the required dependencies:
   ```bash
   npm install
   ```

## Configuration
Create a .env file in the root directory with the following variables.
Example:
   ```bash
API_KEY=<binance-api-key>
SECRET_KEY=<binance-secret-key>
SYMBOL=BTCUSDT
ORDER_QTY=1
PRICE_OFFSET=0.1
CHASE_SIDE=BUY
TESTNET=true
```
## Usage
Run the script with the following command:    
   ```bash
    node index.js
   ```

The bot will:

Connect to Binance WebSocket streams for market and user data.
Place an initial limit order at the specified price offset.
Adjust the order dynamically as the best bid or best ask price moves.
Exit when the order is completely filled.
