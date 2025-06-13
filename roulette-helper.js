// roulette-helper.js (Corrected Version 2)

import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { Pool } from 'pg';

// Using a relative path assumes roulette-constants.js is in a 'lib' folder at the same level as the helper script
import { ROULETTE_BETS, ROULETTE_NUMBER_STICKERS } from './lib/roulette-constants.js';

// --- Helper Functions ---
const escapeHTML = (text) => text ? String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;') : '';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * --- START OF FIX ---
 * This function was missing. It generates the betting keyboard for the user.
 */
const generateRouletteBettingKeyboard = (gameId) => ({
    inline_keyboard: [
        [{ text: "🔴 Red", callback_data: `roulette_bet:${gameId}:RED` }, { text: "⚫ Black", callback_data: `roulette_bet:${gameId}:BLACK` }],
        [{ text: "🔢 Even", callback_data: `roulette_bet:${gameId}:EVEN` }, { text: "🔀 Odd", callback_data: `roulette_bet:${gameId}:ODD` }],
        [{ text: "📉 1-18", callback_data: `roulette_bet:${gameId}:LOW` }, { text: "📈 19-36", callback_data: `roulette_bet:${gameId}:HIGH` }],
        [{ text: "1️⃣ 1st 12", callback_data: `roulette_bet:${gameId}:DOZEN_1` }, { text: "2️⃣ 2nd 12", callback_data: `roulette_bet:${gameId}:DOZEN_2` }, { text: "3️⃣ 3rd 12", callback_data: `roulette_bet:${gameId}:DOZEN_3` }],
        // For now, we will omit the 'Bet on Number' to keep the helper simple. It can be added back later.
        // [{ text: "#️⃣ Bet on Number", callback_data: `roulette_number_prompt:${gameId}` }],
        [{ text: "❌ Cancel Game", callback_data: `roulette_cancel:${gameId}` }]
    ]
});
// --- END OF FIX ---

// --- Main Application ---
const HELPER_BOT_TOKEN = process.env.HELPER_BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

if (!HELPER_BOT_TOKEN || !DATABASE_URL) {
    console.error("Missing HELPER_BOT_TOKEN or DATABASE_URL in .env file.");
    process.exit(1);
}

const bot = new TelegramBot(HELPER_BOT_TOKEN, { polling: { interval: 1000, autoStart: true } });
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

let isShuttingDown = false;

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

        const botInfo = await bot.getMe();
        await client.query("UPDATE roulette_sessions SET status = 'in_progress', helper_bot_id = $1 WHERE session_id = $2", [botInfo.id, session.session_id]);
        
        // This is an approximation for display only, as the helper doesn't have live price feeds.
        const approxBetUSD = (Number(session.bet_amount_lamports) / 1e9 * 150).toFixed(2);
        const introMessage = `🎡 <b>Roulette Time!</b> 🎡\n\nPlayer: ${escapeHTML(gameState.initiatorName)}\nWager: <b>~$${approxBetUSD}</b>\n\nPlease place your bet:`;
        
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

        const isWin = betInfo.numbers.includes(resultNumber);
        
        gameState.outcome = isWin ? 'win' : 'loss';
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

// --- START OF FIX ---
// New function to handle cancelling the game
async function handleCancel(gameId, clickerId) {
    let client = null;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const sessionRes = await client.query("SELECT * FROM roulette_sessions WHERE main_bot_game_id = $1 AND status = 'in_progress' FOR UPDATE", [gameId]);
        if (sessionRes.rowCount === 0) { await client.query('ROLLBACK'); return; }

        const session = sessionRes.rows[0];
        if (String(session.user_id) !== String(clickerId)) { await client.query('ROLLBACK'); return; }
        
        const gameState = session.game_state_json || {};
        await bot.editMessageText('🎡 Roulette game cancelled by player.', { chat_id: session.chat_id, message_id: gameState.helperMessageId, reply_markup: {} });

        // Update the status to completed_loss, the main bot will see this and refund the bet (as payout is 0)
        gameState.outcome = 'cancelled';
        await client.query("UPDATE roulette_sessions SET status = 'completed_loss', game_state_json = $1 WHERE session_id = $2", [JSON.stringify(gameState), session.session_id]);
        await client.query('COMMIT');

    } catch (e) {
        if(client) await client.query('ROLLBACK');
        console.error(`[CancelRoulette GID:${gameId}] Error: ${e.message}`);
    } finally {
        if(client) client.release();
    }
}
// --- END OF FIX ---


async function listen() {
    const client = await pool.connect();
    client.on('notification', (msg) => {
        if (msg.channel === 'roulette_game_pickup') {
            try {
                const payload = JSON.parse(msg.payload);
                if (payload.main_bot_game_id) {
                    console.log(`[HelperListener] Received pickup notification for GID: ${payload.main_bot_game_id}`);
                    handleNewGame(payload.main_bot_game_id);
                }
            } catch (e) { console.error('Error parsing notification payload:', e); }
        }
    });
    await client.query('LISTEN roulette_game_pickup');
    console.log("✅ Roulette Helper Bot is listening for 'roulette_game_pickup' notifications...");
}

bot.on('callback_query', async (callbackQuery) => {
    const [action, gameId, betKey] = callbackQuery.data.split(':');
    const clickerId = String(callbackQuery.from.id);

    if (action === 'roulette_bet') {
        await bot.answerCallbackQuery(callbackQuery.id).catch(()=>{});
        await processBet(gameId, betKey, clickerId);
    } 
    // --- START OF FIX ---
    // Handle the cancel action
    else if (action === 'roulette_cancel') {
        await bot.answerCallbackQuery(callbackQuery.id, {text: "Cancelling game..."}).catch(()=>{});
        await handleCancel(gameId, clickerId);
    }
    // --- END OF FIX ---
});

listen().catch(err => {
    console.error("Failed to start listener:", err);
    process.exit(1);
});
