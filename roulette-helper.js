// roulette-helper.js
import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { Pool } from 'pg';

// --- Shared Constants & Helpers ---
const escapeHTML = (text) => text ? String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;') : '';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const ROULETTE_BETS = { RED: { name: 'Red', numbers: [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36], payout: 1 }, BLACK: { name: 'Black', numbers: [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35], payout: 1 }, EVEN: { name: 'Even', numbers: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36], payout: 1 }, ODD: { name: 'Odd', numbers: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35], payout: 1 }, LOW: { name: '1 to 18', numbers: Array.from({ length: 18 }, (_, i) => i + 1), payout: 1 }, HIGH: { name: '19 to 36', numbers: Array.from({ length: 18 }, (_, i) => i + 19), payout: 1 }, DOZEN_1: { name: '1st 12', numbers: Array.from({ length: 12 }, (_, i) => i + 1), payout: 2 }, DOZEN_2: { name: '2nd 12', numbers: Array.from({ length: 12 }, (_, i) => i + 13), payout: 2 }, DOZEN_3: { name: '3rd 12', numbers: Array.from({ length: 12 }, (_, i) => i + 25), payout: 2 },};
const ROULETTE_NUMBER_STICKERS = { 0: 'CAACAgQAAxkBAAJBZWgfYSq6zCC3d88lfz5jteLmimynAAI6HQAC1AABgFGUwt-ba6VFIzYE', 1: 'CAACAgQAAxkBAAJBZ2gfYZvUDJeXlULdsQNDSr2rnzwkAAKoFgAC9OuBUThYKjFsHNUINgQ', 2: 'CAACAgQAAxkBAAJBaWgfYb_wxliLeJKDquGcr18OhQqZAALVFgAChvR5UXXNtwbTRSMzNgQ', 3: 'CAACAgQAAxkBAAJBa2gfYdx54l6IzOcxKbcZwL_JPoX9AAJJGAACzviBUTIdC1OxHKQaNgQ', 4: 'CAACAgQAAxkBAAJBbWgfYfendTL9svVqMGn7hLVQ79_uAAJ8GAACDciAUYSN0sp7C2LnNgQ', 5: 'CAACAgQAAxkBAAJBb2gfYi8mcel7Tcz9rpppecyOnbfFAALKFgACW3KBUQIpefveRTIKNgQ', 6: 'CAACAgQAAxkBAAJBcWgfYkaraAkefAUzzHZcc43q3j9IAALLGgACC62BUbKIJ7iU0rb4NgQ', 7: 'CAACAgQAAxkBAAJBc2gfYmDRTG0DBQzwP3XJUnZXSonNAALVGAAClPyBUSUxwoUHdsn8NgQ', 8: 'CAACAgQAAxkBAAJBdWgfYns_-_QLLn1G8QLiJO1CsXX1AAKAFAACaVaBUUiaHozlFwAB0jYE', 9: 'CAACAgQAAxkBAAJBd2gfYpkPKaLHd8EnttGX6hyKJzi4AALgFwAC88p5UUHH5NnJwBYPNgQ', 10: 'CAACAgQAAxkBAAJBeWgfYq-pfcJHUfy0tCvYD3cu7EGvAALyGAACucCAUZ6fXOAfAAEs9zYE', 11: 'CAACAgQAAxkBAAJBe2gfYt6hVk2Ads3G5g6VXUW37bUGAALZEwACbN2BURqjRgAB0jLjWDYE', 12: 'CAACAgQAAxkBAAJBfWgfYvZ3tii60_oM3a_lrqQBbOyHAAJVGAACi-eBUVSNH6piCrwsNgQ', 13: 'CAACAgQAAxkBAAJBf2gfYxgIAYEljmSXUw6GMKuEi5B_AAJNHQACZzSAUdecnnT052I6NgQ', 14: 'CAACAgQAAxkBAAJBgWgfYz5-f1TZDdKt8C8WL27n35cBAAJDGQACpcN5URDm4Ifd0r06NgQ', 15: 'CAACAgQAAxkBAAJBg2gfY2fxRZLu2mV1qfIJO6i18UPbAAKtFgACUFaBUf0GoZ1742K-NgQ', 16: 'CAACAgQAAxkBAAJBhWgfY4dwKoW3ECpdcKKy6DE5uA1QAAKvGwACRx95Ub2KbQXS25k_NgQ', 17: 'CAACAgQAAxkBAAJBh2gfY6yoeT7vMohvm9B1N7PwgfchAAIuGAACK5eBUdo-jXChdkRhNgQ', 18: 'CAACAgQAAxkBAAJBiWgfY79nfAK7a2912afa9BAtJNAnAAJjGQACfHt4Uaxk_YBdcErDNgQ', 19: 'CAACAgQAAxkBAAJBi2gfY-xsXeoJwpEPa-Yqpw7DQ0bEAAIpGQACsPCAUfSIqog8-IdgNgQ', 20: 'CAACAgQAAxkBAAJBjWgfZBAig2hwYq8tIdD36oU0LtQrAAJzGgACvs54UZK5KgfIrF_lNgQ', 21: 'CAACAgQAAxkBAAJBj2gfZED5N4ReEwjh2a_CogWqGP3jAALGFwAC_V2AUXeSG0ZgWd5jNgQ', 22: 'CAACAgQAAxkBAAJBkWgfZGdRsRKjou304SUpaWG3CtBxAAMZAAITwoBRIlMrM9BBD0g2BA', 23: 'CAACAgQAAxkBAAJBk2gfZH-PyfcbL7LYTN6FUTtKOed3AAJMGAAC6d2BUXq6dfIzfhljNgQ', 24: 'CAACAgQAAxkBAAJBlWgfZKI-I-KyhLjQ5nSm5A1OIvzaAALhGgACeS-AUdEviXb3bvCcNgQ', 25: 'CAACAgQAAxkBAAJBl2gfZM2EOYpsold9-M-HnM2wfzTEAALmFwACI96AUWwyQ3Omp9HTNgQ', 26: 'CAACAgQAAxkBAAJBmWgfZPnEQpGb-0yimgkTVCaE9TUlAALNIAACfXmBUb6hDihoktivNgQ', 27: 'CAACAgQAAxkBAAJBm2gfZRttjRHgFKoioD6IhdxuAAEZGwACoBcAAjK0gVFqoRMWJ0V2AjYE', 28: 'CAACAgQAAxkBAAJBnWgfZVFWHJQRa6FhH4o1dS3WWMxNAALzFQACNO2BUVsOM4juGOTINgQ', 29: 'CAACAgQAAxkBAAJBn2gfZWv8OjdgLiE5lZn_lQXEokjzAAJ6FwACAvZ4UXK88kRPGqWWNgQ', 30: 'CAACAgQAAxkBAAJBoWgfZZBs_hsDu7T-cinVkP_fJjXOAAKsFQACoyyBUSIq6OlCBV8kNgQ', 31: 'CAACAgQAAxkBAAJBo2gfZeSRehu15Pfc1iLDkjugPR_GAAIOGwACtbqAUQ1y_oj3ur3ENgQ', 32: 'CAACAgQAAxkBAAJBpWgfZgEsD9p27FCjyt-SKHVyKf6TAAJbFwACyad5UYWo5iH3DzX9NgQ', 33: 'CAACAgQAAxkBAAJBp2gfZih_bMs_GQQWpwUcg_JYe0C6AAKMGQACjcl4URhc62AjMUuNNgQ', 34: 'CAACAgQAAxkBAAJBqWgfZleUcTpdKvRSMvv9x-XHERkaAAJYFgAC-feBUSUjonJS-hFjNgQ', 35: 'CAACAgQAAxkBAAJBq2gfZmVMVKXbQeXyEc5tYQIn86rdAAKSFgACwpOAUcdyb2uPc8PINgQ', 36: 'CAACAgQAAxkBAAJBrWgfZpPf7L25sYYDrqF7-rnDfvVjAAKsFwAC1tCBUW3xTDWDKfgwNgQ', default: 'CAACAgQAAxkBAAJBZWgfYSq6zCC3d88lfz5jteLmimynAAI6HQAC1AABgFGUwt-ba6VFIzYE'};


// --- Main Application ---
const HELPER_BOT_TOKEN = process.env.HELPER_BOT_TOKEN; // Use a specific token for this bot
const DB_URL = process.env.DATABASE_URL;

if (!HELPER_BOT_TOKEN || !DB_URL) {
    console.error("Missing HELPER_BOT_TOKEN or DATABASE_URL in .env file.");
    process.exit(1);
}

const bot = new TelegramBot(HELPER_BOT_TOKEN);
const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

async function handleNewGame(mainBotGameId) {
    const logPrefix = `[HandleSession GID:${mainBotGameId}]`;
    let client = null;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const sessionRes = await client.query("SELECT * FROM roulette_sessions WHERE main_bot_game_id = $1 AND status = 'pending_pickup' FOR UPDATE SKIP LOCKED", [mainBotGameId]);
        if (sessionRes.rowCount === 0) { await client.query('ROLLBACK'); return; }
        
        const session = sessionRes.rows[0];
        const gameState = session.game_state_json || {};

        await client.query("UPDATE roulette_sessions SET status = 'in_progress', helper_bot_id = $1 WHERE session_id = $2", [(await bot.getMe()).id, session.session_id]);
        
        const introMessage = `🎡 <b>Roulette Time!</b> 🎡\n\nPlayer: ${escapeHTML(gameState.initiatorName)}\nWager: ${(Number(session.bet_amount_lamports) / 1e9).toFixed(2)} SOL\n\nPlease place your bet:`;
        
        const sentMsg = await bot.sendMessage(session.chat_id, introMessage, { parse_mode: 'HTML', reply_markup: generateRouletteBettingKeyboard(mainBotGameId) });
        
        gameState.helperMessageId = sentMsg.message_id;
        await client.query("UPDATE roulette_sessions SET game_state_json = $1 WHERE session_id = $2", [JSON.stringify(gameState), session.session_id]);
        
        await client.query('COMMIT');
    } catch (e) {
        if (client) await client.query('ROLLBACK');
        console.error(`${logPrefix} Error handling new game session: ${e.message}`);
    } finally {
        if (client) client.release();
    }
}

async function processBet(gameId, betKey, clickerId) {
    const logPrefix = `[ProcessBet GID:${gameId}]`;
    let client = null;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        
        const sessionRes = await client.query("SELECT * FROM roulette_sessions WHERE main_bot_game_id = $1 AND status = 'in_progress' FOR UPDATE", [gameId]);
        if (sessionRes.rowCount === 0) { await client.query('ROLLBACK'); return; }

        const session = sessionRes.rows[0];
        if (String(session.user_id) !== String(clickerId)) { await client.query('ROLLBACK'); return; }

        const gameState = session.game_state_json || {};
        const betInfo = ROULETTE_BETS[betKey];

        gameState.betType = betInfo.type;
        gameState.betValue = betKey;

        const resultNumber = Math.floor(Math.random() * 37);
        gameState.winningNumber = resultNumber;

        let isWin = betInfo.numbers.includes(resultNumber);
        
        gameState.outcome = isWin ? 'win' : 'loss';
        // Main bot calculates actual payout, helper just provides multiplier
        gameState.payoutMultiplier = isWin ? (1 + betInfo.payout) : 0;

        await bot.editMessageText(`Spinning for your bet on <b>${escapeHTML(betInfo.name)}</b>...`, { chat_id: session.chat_id, message_id: gameState.helperMessageId, parse_mode: 'HTML' });
        await sleep(1500);
        
        const stickerId = ROULETTE_NUMBER_STICKERS[resultNumber] || ROULETTE_NUMBER_STICKERS.default;
        await bot.sendSticker(session.chat_id, stickerId);
        await sleep(4000);

        await client.query("UPDATE roulette_sessions SET status = $1, game_state_json = $2 WHERE session_id = $3", [`completed_${gameState.outcome}`, JSON.stringify(gameState), session.session_id]);
        await client.query('COMMIT');
        
        await bot.deleteMessage(session.chat_id, gameState.helperMessageId).catch(()=>{});
    } catch (e) {
        if(client) await client.query('ROLLBACK');
        console.error(`${logPrefix} Error processing bet: ${e.message}`);
    } finally {
        if(client) client.release();
    }
}


async function listen() {
    const client = await pool.connect();
    client.on('notification', (msg) => {
        if (msg.channel === 'roulette_game_pickup') { // Listen on the dedicated channel
            try {
                const payload = JSON.parse(msg.payload);
                handleNewGame(payload.main_bot_game_id);
            } catch (e) {
                console.error('Error parsing notification payload:', e);
            }
        }
    });
    await client.query('LISTEN roulette_game_pickup');
    console.log("✅ Roulette Helper Bot is listening for new games...");
}

bot.on('callback_query', async (callbackQuery) => {
    const [action, gameId, betKey] = callbackQuery.data.split(':');
    const clickerId = String(callbackQuery.from.id);

    if (action === 'roulette_bet') {
        await processBet(gameId, betKey, clickerId);
    } 
});

// Start listening
listen().catch(err => {
    console.error("Failed to start listener:", err);
    process.exit(1);
});
