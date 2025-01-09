const TelegramBot = require('node-telegram-bot-api');
const { ethers } = require('ethers');

const TELEGRAM_TOKEN = '7997133490:AAHSwsW3tg85iGAd4ourHORVvF513ThAL40';
const CHAT_ID = '947192975';
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const RPC_URL = 'https://mainnet.bitfinity.network/';
const CONTRACT_ADDRESS = '0xe3Fe6cDd76428F8FDC5ae09c0D5B189DD1298E58';

// ERC20 Interface for token details
const ERC20_ABI = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
];

// Router Interface
const ROUTER_INTERFACE = new ethers.utils.Interface([
    "function multicall(bytes[] data) payable returns (bytes[])",
    "function exactInput(tuple(bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum) params) external payable returns (uint256 amountOut)",
    "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)"
]);

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

async function getTokenInfo(tokenAddress) {
    try {
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const [symbol, decimals] = await Promise.all([
            token.symbol(),
            token.decimals()
        ]);
        return { symbol, decimals };
    } catch (e) {
        return { symbol: 'UNKNOWN', decimals: 18 };
    }
}

async function formatTokenAmount(amount, tokenAddress) {
    const { symbol, decimals } = await getTokenInfo(tokenAddress);
    const formatted = ethers.utils.formatUnits(amount, decimals);
    return `${formatted} ${symbol}`;
}

async function main() {
    console.log('Starting to monitor transactions...');

    provider.on('block', async (blockNumber) => {
        console.log(`New block detected: ${blockNumber}`);
        try {
            const block = await provider.getBlockWithTransactions(blockNumber);
            
            for (let tx of block.transactions) {
                if (tx.to?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()) {
                    const receipt = await provider.getTransactionReceipt(tx.hash);
                    
                    let swapInfo = '';
                    try {
                        const decoded = ROUTER_INTERFACE.parseTransaction({ data: tx.data });
                        swapInfo = `Method: ${decoded.name}\n`;
                        if (decoded.args) {
                            if (decoded.name === 'multicall') {
                                for (const call of decoded.args[0]) {
                                    try {
                                        const innerDecode = ROUTER_INTERFACE.parseTransaction({ data: call });
                                        swapInfo += `Inner call: ${innerDecode.name}\n`;
                                        swapInfo += `Parameters: ${JSON.stringify(innerDecode.args, null, 2)}\n`;
                                    } catch (e) {
                                        // Skip failed inner decode
                                    }
                                }
                            } else {
                                swapInfo += `Parameters: ${JSON.stringify(decoded.args, null, 2)}\n`;
                            }
                        }
                    } catch (e) {
                        swapInfo = `Raw Input: ${tx.data}\n`;
                    }

                    // Track all transfers to identify token movements
                    const transfers = [];
                    for (const log of receipt.logs) {
                        try {
                            const decoded = new ethers.utils.Interface([
                                "event Transfer(address indexed from, address indexed to, uint256 value)"
                            ]).parseLog(log);
                            
                            if (decoded.name === 'Transfer') {
                                const amount = await formatTokenAmount(
                                    decoded.args.value,
                                    log.address
                                );
                                transfers.push({
                                    token: log.address,
                                    from: decoded.args.from,
                                    to: decoded.args.to,
                                    amount
                                });
                            }
                        } catch (e) {}
                    }

                    const message = 
                        `🔄 Swap Transaction Detected!\n\n` +
                        `Tx Hash: ${tx.hash}\n` +
                        `Block: ${blockNumber}\n` +
                        `From: ${tx.from}\n` +
                        `Gas Used: ${receipt.gasUsed.toString()}\n` +
                        `Status: ${receipt.status === 1 ? '✅ Success' : '❌ Failed'}\n\n` +
                        `Token Movements:\n` +
                        transfers.map(t => 
                            `${t.from.slice(0, 6)}...${t.from.slice(-4)} ➔ ` +
                            `${t.to.slice(0, 6)}...${t.to.slice(-4)}\n` +
                            `Amount: ${t.amount}`
                        ).join('\n\n');

                    await bot.sendMessage(CHAT_ID, message);
                    console.log(message);
                }
            }
        } catch (err) {
            console.error('Error processing block:', err);
        }
    });
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
