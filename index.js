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
let users = loadUsers(); // بارگذاری کاربران از فایل

// تابع بارگذاری کاربران
function loadUsers() {
    try {
        return JSON.parse(fs.readFileSync("user.json", "utf8"));
    } catch (error) {
        return [];
    }
}

// تابع ذخیره کاربران
function saveUsers() {
    fs.writeFileSync("user.json", JSON.stringify(users, null, 2));
}

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

// بررسی عضویت کاربر در کانال
async function checkUserSubscription(userId) {
    try {
        const member = await bot.getChatMember(CHANNEL_USERNAME, userId);
        return ["member", "administrator", "creator"].includes(member.status);
    } catch (error) {
        return false;
    }
}

// پیام خوش‌آمدگویی و ثبت کاربر
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
                    [{ text: "📢 ارسال پیام همگانی", callback_data: "broadcast" }]
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

    if (!msg.text) return; // جلوگیری از کرش در صورتی که پیام متنی نباشد

    const query = msg.text.trim();

    if (!query.startsWith("/")) {
        if (blockedUsers.has(userId) && userId !== ADMIN_ID) {
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
            const caption = `🎬 *${anime.title.native}*\n\n*نام انگلیسی:* ${anime.title.english}\n*نام فارسی:* ${anime.title.romaji}\n📅 *سال انتشار:* ${anime.seasonYear}\n📊 *امتیاز:* ${anime.averageScore / 10}/10\n🎭 *ژانر:* ${genres}\n🎥 *تعداد قسمت‌ها:* ${anime.episodes}\n\n🔻 *شما می‌توانید این انیمه را با کلیک کردن روی دکمه پایین دانلود کنید:*`;

            bot.sendPhoto(chatId, anime.coverImage.large, {
                caption,
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [[{ text: "⬇️ دانلود انیمه", url: DOWNLOAD_LINK }]]
                }
            });
        } else {
            bot.sendMessage(chatId, "⚠️ انیمه‌ای با این نام پیدا نشد.");
        }
    }
});
// مدیریت پنل ادمین
bot.on("callback_query", async (callback) => {
    const chatId = callback.message.chat.id;

    if (callback.data === "stats") {
        bot.sendMessage(chatId, `📊 تعداد کل کاربران: ${users.length}`);
    } else if (callback.data === "broadcast") {
        bot.sendMessage(chatId, "📢 پیام موردنظر خود را ارسال کنید:");
        bot.once("message", async (msg) => {
            const messageText = msg.text;
            for (const userId of users) {
                try {
                    await bot.sendMessage(userId, `📢 پیام جدید از ادمین:\n\n${messageText}`);
                } catch (error) {
                    console.error(`❌ ارسال پیام به ${userId} ناموفق بود.`);
                }
            }
            bot.sendMessage(chatId, "✅ پیام به همه کاربران ارسال شد.");
        });
    }
});

console.log("✅ ربات فعال شد...");

// Render نیاز به یک پورت باز دارد
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
