// index.js

// 1. Подключаем нужные библиотеки
const TelegramBot = require('node-telegram-bot-api');
const { ethers } = require('ethers');

// 2. Указываем токен бота и ваш CHAT_ID
const TELEGRAM_TOKEN = '7997133490:AAHSwsW3tg85iGAd4ourHORVvF513ThAL40'; // Замените на свой токен бота
const CHAT_ID = '6744685856'; // Замените на ваш chat_id

// 3. Инициализируем Telegram-бот
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// 4. Настройка подключения к блокчейну
const RPC_URL = 'https://mainnet.bitfinity.network/';
const CONTRACT_ADDRESS = '0xe3Fe6cDd76428F8FDC5ae09c0D5B189DD1298E58';

// Создаём провайдер через ethers.js
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

// 5. Основная функция
async function main() {
  console.log('Starting to monitor blocks...');

  // Подписываемся на событие появления нового блока
  provider.on('block', async (blockNumber) => {
    console.log(`New block detected: ${blockNumber}`);

    try {
      // Получаем блок вместе со всеми транзакциями
      const block = await provider.getBlockWithTransactions(blockNumber);

      // Перебираем транзакции в блоке
      for (let tx of block.transactions) {
        // Проверяем, что транзакция отправлена к нужному адресу
        if (tx.to && tx.to.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()) {
          console.log('--- Contract interaction detected! ---');
          console.log(`Tx Hash: ${tx.hash}`);
          console.log(`From: ${tx.from}`);
          console.log(`Value: ${ethers.utils.formatEther(tx.value)} ETH`);
          console.log('-------------------------------------');

          // Отправляем сообщение в Telegram
          await bot.sendMessage(
            CHAT_ID,
            `📢 Interaction with contract detected!\n\n` +
            `Tx Hash: ${tx.hash}\n` +
            `From: ${tx.from}\n` +
            `Value: ${ethers.utils.formatEther(tx.value)} ETH`
          );
        }
      }
    } catch (err) {
      console.error('Error processing block:', err);
    }
  });
}

// 6. Запуск кода
main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
