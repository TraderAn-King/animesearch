require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

// اطلاعات ربات
const BOT_TOKEN = process.env.BOT_TOKEN;
const DOWNLOAD_LINK = "https://t.me/Anime_Faarsi";
const ADMIN_ID = 2048310529;
const CHANNEL_USERNAME = "@Anime_Faarsi";

// راه‌اندازی ربات
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

let blockedUsers = new Set();

// تابع برای جستجوی انیمه در AniList
async function searchAnime(query) {
    const url = "https://graphql.anilist.co";
    const queryData = {
        query: `
            query ($search: String) {
                Media (search: $search, type: ANIME) {
                    title {
                        romaji
                        english
                    }
                    season
                    seasonYear
                    episodes
                    format
                    genres
                    averageScore
                    coverImage {
                        large
                    }
                }
            }
        `,
        variables: { search: query }
    };

    try {
        const response = await axios.post(url, queryData);
        return response.data.data.Media;
    } catch (error) {
        console.error("❌ Error fetching anime:", error);
        return null;
    }
}

// بررسی عضویت کاربر در کانال
async function checkUserSubscription(userId) {
    try {
        const member = await bot.getChatMember(CHANNEL_USERNAME, userId);
        return ["member", "administrator", "creator"].includes(member.status);
    } catch (error) {
        return false;
    }
}

// پیام خوش‌آمدگویی
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (userId === ADMIN_ID) {
        bot.sendMessage(chatId, "👨‍💻 *پنل مدیریت*", {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🚫 مسدود کردن کاربر", callback_data: "block_user" }],
                    [{ text: "✅ رفع مسدودیت", callback_data: "unblock_user" }]
                ]
            }
        });
    } else {
        const isSubscribed = await checkUserSubscription(userId);
        if (!isSubscribed) {
            bot.sendMessage(chatId, `⚠️ ابتدا در کانال عضو شوید:\n👉 ${DOWNLOAD_LINK}`, {
                reply_markup: {
                    inline_keyboard: [[{ text: "عضویت در کانال", url: DOWNLOAD_LINK }]]
                }
            });
            return;
        }

        bot.sendMessage(chatId, "👋 خوش آمدید! برای جستجوی انیمه نام آن را ارسال کنید.");
    }
});

// دریافت نام انیمه از کاربر
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const query = msg.text.trim();

    if (!query.startsWith("/")) {
        if (blockedUsers.has(userId)) {
            bot.sendMessage(chatId, "❌ شما مسدود شده‌اید.");
            return;
        }

        const isSubscribed = await checkUserSubscription(userId);
        if (!isSubscribed) {
            bot.sendMessage(chatId, `⚠️ ابتدا در کانال عضو شوید:\n👉 ${DOWNLOAD_LINK}`);
            return;
        }

        const anime = await searchAnime(query);
        if (anime) {
            const genres = anime.genres.map(g => `#${g.replace(/\s/g, "_")}`).join(" ");
            const caption = `🎬 *${anime.title.romaji}*\n📅 سال انتشار: ${anime.seasonYear}\n📊 امتیاز: ${anime.averageScore / 10}/10\n🎭 ژانر: ${genres}`;

            bot.sendPhoto(chatId, anime.coverImage.large, { caption, parse_mode: "Markdown" });

            bot.sendMessage(chatId, "🔻 دانلود انیمه:", {
                reply_markup: {
                    inline_keyboard: [[{ text: "دانلود", url: DOWNLOAD_LINK }]]
                }
            });

            bot.sendMessage(ADMIN_ID, `⚠️ کاربر ${userId} درخواست انیمه "${query}" را دارد.`);
        } else {
            bot.sendMessage(chatId, "⚠️ انیمه‌ای با این نام پیدا نشد.");
        }
    }
});

// مدیریت پنل ادمین
bot.on("callback_query", async (callback) => {
    const chatId = callback.message.chat.id;

    if (callback.data === "block_user") {
        bot.sendMessage(chatId, "👤 شناسه کاربری کاربر را ارسال کنید:");
        bot.once("message", (msg) => {
            blockedUsers.add(parseInt(msg.text.trim()));
            bot.sendMessage(chatId, "✅ کاربر مسدود شد.");
        });
    } else if (callback.data === "unblock_user") {
        bot.sendMessage(chatId, "👤 شناسه کاربری کاربر را ارسال کنید:");
        bot.once("message", (msg) => {
            blockedUsers.delete(parseInt(msg.text.trim()));
            bot.sendMessage(chatId, "✅ کاربر رفع مسدودیت شد.");
        });
    }
});

console.log("✅ ربات فعال شد...");
