require("dotenv").config();
const fs = require("fs");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const express = require("express");
const app = express();

app.get("/", (req, res) => {
    res.send("✅ Bot is running...");
});

// اطلاعات ربات
const BOT_TOKEN = process.env.BOT_TOKEN;
const DOWNLOAD_LINK = "https://t.me/Anime_Faarsi";
const ADMIN_ID = 2048310529;
const CHANNEL_USERNAME = "@Anime_Faarsi";

// راه‌اندازی ربات
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

let blockedUsers = new Set();
let users = loadUsers();
let messages = loadMessages(); // بارگذاری پیام‌ها

// بارگذاری کاربران از فایل
function loadUsers() {
    try {
        return JSON.parse(fs.readFileSync("user.json", "utf8"));
    } catch (error) {
        return [];
    }
}

// ذخیره کاربران
function saveUsers() {
    fs.writeFileSync("user.json", JSON.stringify(users, null, 2));
}

// بارگذاری پیام‌های ربات
function loadMessages() {
    try {
        return JSON.parse(fs.readFileSync("messages.json", "utf8"));
    } catch (error) {
        return {
            start: "👋 خوش آمدید! برای جستجوی انیمه نام آن را ارسال کنید.",
            blocked: "❌ شما مسدود شده‌اید.",
            no_result: "⚠️ انیمه‌ای با این نام پیدا نشد.",
            subscribe: `⚠️ ابتدا در کانال عضو شوید:\n👉 ${DOWNLOAD_LINK}`
        };
    }
}

// ذخیره پیام‌های ربات
function saveMessages() {
    fs.writeFileSync("messages.json", JSON.stringify(messages, null, 2));
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

// مدیریت دستورات ادمین
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!users.includes(userId)) {
        users.push(userId);
        saveUsers();
    }

    if (userId === ADMIN_ID) {
        bot.sendMessage(chatId, "👨‍💻 *پنل مدیریت*", {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📊 آمار کاربران", callback_data: "stats" }],
                    [{ text: "📢 ارسال پیام همگانی", callback_data: "broadcast" }],
                    [{ text: "💬 تغییر پیام‌های ربات", callback_data: "edit_messages" }]
                ]
            }
        });
    } else {
        const isSubscribed = await checkUserSubscription(userId);
        if (!isSubscribed) {
            bot.sendMessage(chatId, messages.subscribe, {
                reply_markup: {
                    inline_keyboard: [[{ text: "عضویت در کانال", url: DOWNLOAD_LINK }]]
                }
            });
            return;
        }
        bot.sendMessage(chatId, messages.start);
    }
});

// دریافت نام انیمه از کاربر
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!msg.text || msg.text.startsWith("/")) return;

    if (blockedUsers.has(userId) && userId !== ADMIN_ID) {
        bot.sendMessage(chatId, messages.blocked);
        return;
    }

    const isSubscribed = await checkUserSubscription(userId);
    if (!isSubscribed) {
        bot.sendMessage(chatId, messages.subscribe);
        return;
    }

    const query = msg.text.trim();
    const anime = await searchAnime(query);
    if (anime) {
        const genres = anime.genres.map(g => `#${g.replace(/\s/g, "_")}`).join(" ");
        const caption = `🎬 *${anime.title.native}*\n\n*نام انگلیسی:* ${anime.title.english}\n*نام فارسی:* ${anime.title.romaji}\n📅 *سال انتشار:* ${anime.seasonYear}\n📊 *امتیاز:* ${anime.averageScore / 10}/10\n🎭 *ژانر:* ${genres}\n🎥 *تعداد قسمت‌ها:* ${anime.episodes}\n\n🔻 *شما می‌توانید این انیمه را با کلیک کردن روی دکمه پایین دانلود کنید:*`;

        bot.sendPhoto(chatId, anime.coverImage.large, {
            caption,
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [[{ text: "⬇️ دانلود انیمه", url: DOWNLOAD_LINK }]]
            }
        });
    } else {
        bot.sendMessage(chatId, messages.no_result);
    }
});

// مدیریت دکمه‌های ادمین
bot.on("callback_query", async (callback) => {
    const chatId = callback.message.chat.id;

    if (callback.data === "stats") {
        bot.sendMessage(chatId, `📊 تعداد کل کاربران: ${users.length}`);
    } else if (callback.data === "broadcast") {
        bot.sendMessage(chatId, "📢 پیام موردنظر خود را ارسال کنید:");
        bot.once("message", async (msg) => {
            for (const userId of users) {
                try {
                    await bot.sendMessage(userId, `📢 پیام جدید:\n\n${msg.text}`);
                } catch (error) {
                    console.error(`❌ ارسال پیام به ${userId} ناموفق بود.`);
                }
            }
            bot.sendMessage(chatId, "✅ پیام به همه کاربران ارسال شد.");
        });
    } else if (callback.data === "edit_messages") {
        bot.sendMessage(chatId, "🔧 نام متنی که می‌خواهید تغییر دهید (start, blocked, no_result, subscribe):");
        bot.once("message", (msg) => {
            const key = msg.text;
            if (!messages[key]) {
                bot.sendMessage(chatId, "⚠️ متن نامعتبر است.");
                return;
            }
            bot.sendMessage(chatId, "✏️ متن جدید را بفرستید:");
            bot.once("message", (newMsg) => {
                messages[key] = newMsg.text;
                saveMessages();
                bot.sendMessage(chatId, "✅ متن تغییر یافت.");
            });
        });
    }
});

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
                        native
                    }
                    seasonYear
                    episodes
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

console.log("✅ ربات فعال شد...");

// Render نیاز به یک پورت باز دارد
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
