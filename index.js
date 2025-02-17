require("dotenv").config();
const fs = require("fs");
const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

// اطلاعات ربات
const BOT_TOKEN = process.env.BOT_TOKEN || "توکن_ربات";
const DOWNLOAD_LINK = "https://t.me/Anime_Faarsi";
const PORT = process.env.PORT || 3000;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();

app.get("/", (req, res) => {
    res.send("✅ Bot is running...");
});

// پیام شروع
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "👋 سلام! نام انیمه‌ای که می‌خواهید جستجو شود را ارسال کنید.");
});

// دریافت نام انیمه از کاربر
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const animeName = msg.text.trim();

    if (!animeName || animeName.startsWith("/")) return;

    try {
        let response = await axios.get(`https://api.jikan.moe/v4/anime?q=${animeName}`);
        let anime = response.data.data[0];

        if (!anime) {
            bot.sendMessage(chatId, "⚠️ انیمه‌ای با این نام یافت نشد.");
            return;
        }

        let genres = anime.genres.map(g => `#${g.name.replace(/\s/g, "_")}`).join(" ");
        let synopsis = anime.synopsis ? anime.synopsis.substring(0, 500) + "..." : "❌ خلاصه موجود نیست.";
        let episodes = anime.episodes || "نامشخص";
        let year = anime.year || "نامشخص";
        let score = anime.score || "نامشخص";
        let duration = anime.duration || "نامشخص";

        let caption = `🎬 *نام انیمه:* ${anime.title}\n` +
                      `🇬🇧 *نام انگلیسی:* ${anime.title_english || "ندارد"}\n` +
                      `📅 *سال انتشار:* ${year}\n` +
                      `⭐ *امتیاز:* ${score}\n` +
                      `🎭 *ژانر:* ${genres}\n` +
                      `📺 *تعداد قسمت‌ها:* ${episodes}\n` +
                      `🕒 *زمان هر قسمت:* ${duration}\n\n` +
                      `📖 *خلاصه:* ${synopsis}\n\n` +
                      `📥 *لینک‌های دانلود:*`;

        let buttons = [];
        for (let i = 1; i <= Math.min(episodes, 20); i++) {
            buttons.push([{ text: `📥 Episode ${i}`, url: DOWNLOAD_LINK }]);
        }
        buttons.push([{ text: "📥 دانلود فصل دوم", url: DOWNLOAD_LINK }]);
        buttons.push([{ text: "📥 دانلود فصل سوم", url: DOWNLOAD_LINK }]);

        bot.sendPhoto(chatId, anime.images.jpg.large_image_url, {
            caption,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: buttons }
        });

    } catch (error) {
        console.error("❌ خطا در دریافت اطلاعات انیمه:", error);
        bot.sendMessage(chatId, "❌ مشکلی پیش آمد. لطفاً دوباره تلاش کنید.");
    }
});

// اجرای سرور Express
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
