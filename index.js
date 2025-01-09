const TelegramBot = require('node-telegram-bot-api');
const { ethers } = require('ethers');

const TELEGRAM_TOKEN = '7997133490:AAHSwsW3tg85iGAd4ourHORVvF513ThAL40';
const CHAT_ID = '947192975';
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const RPC_URL = 'https://mainnet.bitfinity.network/';
const CONTRACT_ADDRESS = '0xe3Fe6cDd76428F8FDC5ae09c0D5B189DD1298E58';

const ERC20_ABI = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function name() view returns (string)"
];

const ROUTER_INTERFACE = new ethers.utils.Interface([
    "function multicall(bytes[] data) payable returns (bytes[])",
    "function exactInput(tuple(bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum) params) external payable returns (uint256 amountOut)",
    "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)"
]);

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

async function getTokenInfo(tokenAddress) {
    try {
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const [symbol, decimals, name] = await Promise.all([
            token.symbol(),
            token.decimals(),
            token.name()
        ]);
        return { symbol, decimals, name };
    } catch (e) {
        return { symbol: 'UNKNOWN', decimals: 18, name: 'Unknown Token' };
    }
}

async function formatTokenAmount(amount, tokenAddress) {
    const { symbol, decimals, name } = await getTokenInfo(tokenAddress);
    const formatted = ethers.utils.formatUnits(amount, decimals);
    return {
        formatted: `${formatted} ${symbol}`,
        symbol,
        name,
        amount: formatted
    };
}

function findSwapTokens(transfers, userAddress) {
    // Find the token being sent (from user to contract)
    const tokenInIndex = transfers.findIndex(t => 
        t.from.toLowerCase() === userAddress.toLowerCase()
    );

    if (tokenInIndex === -1) return { tokenIn: null, tokenOut: null };

    // Find the token being received (from contract to user)
    const tokenOutIndex = transfers.findIndex((t, index) => 
        index > tokenInIndex && 
        t.to.toLowerCase() === userAddress.toLowerCase()
    );

    return {
        tokenIn: tokenInIndex !== -1 ? transfers[tokenInIndex] : null,
        tokenOut: tokenOutIndex !== -1 ? transfers[tokenOutIndex] : null
    };
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
                    const userAddress = tx.from.toLowerCase();
                    
                    // Track all transfers to identify token movements
                    const transfers = [];
                    for (const log of receipt.logs) {
                        try {
                            const decoded = new ethers.utils.Interface([
                                "event Transfer(address indexed from, address indexed to, uint256 value)"
                            ]).parseLog(log);
                            
                            if (decoded.name === 'Transfer') {
                                const tokenInfo = await formatTokenAmount(
                                    decoded.args.value,
                                    log.address
                                );
                                transfers.push({
                                    token: log.address,
                                    tokenInfo,
                                    from: decoded.args.from.toLowerCase(),
                                    to: decoded.args.to.toLowerCase()
                                });
                            }
                        } catch (e) {}
                    }

                    const { tokenIn, tokenOut } = findSwapTokens(transfers, userAddress);
                    
                    let swapDetails = '';
                    if (tokenIn && tokenOut) {
                        swapDetails = 
                            `Swapped:\n` +
                            `${tokenIn.tokenInfo.formatted} ➜ ${tokenOut.tokenInfo.formatted}\n\n`;
                    }

                    const message = 
                        `🔄 Swap Transaction Detected!\n\n` +
                        swapDetails +
                        `All Token Movements:\n` +
                        transfers.map(t => {
                            const direction = t.from === userAddress ? "OUT ↗️" : 
                                            t.to === userAddress ? "IN ↙️" : "INTERNAL ↔️";
                            return `${direction} ${t.tokenInfo.formatted}\n` +
                                   `From: ${t.from.slice(0, 6)}...${t.from.slice(-4)}\n` +
                                   `To: ${t.to.slice(0, 6)}...${t.to.slice(-4)}`;
                        }).join('\n\n') +
                        `\n\nTx Hash: ${tx.hash}\n` +
                        `Block: ${blockNumber}\n` +
                        `From: ${tx.from}\n` +
                        `Gas Used: ${receipt.gasUsed.toString()}\n` +
                        `Status: ${receipt.status === 1 ? '✅ Success' : '❌ Failed'}`;

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
