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

const startTime = Date.now(); // زمان شروع ربات

// راه‌اندازی ربات
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

let blockedUsers = new Set();
let users = loadUsers();
let messages = loadMessages(); // بارگذاری پیام‌ها

let animeData = loadAnimeData(); // بارگذاری انیمه‌ها

// تابع ذخیره انیمه‌ها
function saveAnimeData() {
    fs.writeFileSync("animeData.json", JSON.stringify(animeData, null, 2));
}

// تابع بارگذاری انیمه‌ها
function loadAnimeData() {
    try {
        return JSON.parse(fs.readFileSync("animeData.json", "utf8"));
    } catch (error) {
        return {};
    }
}

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

bot.onText(/\/profile/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // بررسی اگر کاربر به یک عکس ریپلای کرده باشد
    if (msg.reply_to_message && msg.reply_to_message.photo) {
        const photo = msg.reply_to_message.photo.pop(); // گرفتن آخرین کیفیت عکس
        bot.sendPhoto(chatId, photo.file_id, { caption: "📷 این تصویر پروفایل شما است." });
        return;
    }

    try {
        // دریافت عکس پروفایل کاربر
        const photos = await bot.getUserProfilePhotos(userId);
        if (photos.total_count > 0) {
            const profilePhoto = photos.photos[0].pop(); // گرفتن آخرین کیفیت عکس
            bot.sendPhoto(chatId, profilePhoto.file_id, { caption: "📷 عکس پروفایل شما." });
        } else {
            // ارسال عکس پیش‌فرض در صورتی که پروفایل نداشته باشد
            bot.sendPhoto(chatId, "https://via.placeholder.com/512", { caption: "❌ شما عکسی در پروفایل ندارید." });
        }
    } catch (error) {
        bot.sendMessage(chatId, "❌ مشکلی در دریافت پروفایل رخ داد.");
        console.error(error);
    }
});

let antiLinkEnabled = false;

bot.onText(/\/antilink/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (userId !== ADMIN_ID) {
        bot.sendMessage(chatId, "❌ شما اجازه این کار را ندارید.");
        return;
    }

    antiLinkEnabled = !antiLinkEnabled;
    bot.sendMessage(chatId, `🔗 سیستم ضد لینک ${antiLinkEnabled ? "فعال" : "غیرفعال"} شد.`);
});

bot.on("message", (msg) => {
    if (antiLinkEnabled && msg.text && msg.text.includes("http")) {
        bot.deleteMessage(msg.chat.id, msg.message_id);
        bot.sendMessage(msg.chat.id, `⚠️ ارسال لینک در این گروه مجاز نیست!`, { reply_to_message_id: msg.message_id });
    }
});

bot.onText(/\/ban/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!msg.reply_to_message) {
        bot.sendMessage(chatId, "⚠️ لطفاً روی پیام کاربری که می‌خواهید اخراج کنید، ریپلای کنید.");
        return;
    }

    const bannedUserId = msg.reply_to_message.from.id;

    try {
        const chatMember = await bot.getChatMember(chatId, userId);
        if (chatMember.status === "administrator" || chatMember.status === "creator") {
            await bot.banChatMember(chatId, bannedUserId);
            bot.sendMessage(chatId, `🚫 کاربر [${msg.reply_to_message.from.first_name}](tg://user?id=${bannedUserId}) از گروه اخراج شد.`, { parse_mode: "Markdown" });
        } else {
            bot.sendMessage(chatId, "❌ شما ادمین نیستید و اجازه اخراج کاربران را ندارید.");
        }
    } catch (error) {
        bot.sendMessage(chatId, "❌ خطایی رخ داد، مطمئن شوید که ربات دسترسی مدیریت دارد.");
        console.error(error);
    }
});

bot.onText(/\/unban ?(\d+)?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    let unbanUserId = match[1] ? parseInt(match[1]) : null;

    if (!unbanUserId && msg.reply_to_message) {
        unbanUserId = msg.reply_to_message.from.id; // اگر روی پیام ریپلای کرده باشد، آیدی کاربر را بگیرد
    }

    if (!unbanUserId) {
        bot.sendMessage(chatId, "⚠️ لطفاً آیدی کاربر را وارد کنید یا روی پیام او ریپلای کنید.");
        return;
    }

    try {
        const chatMember = await bot.getChatMember(chatId, userId);
        if (chatMember.status === "administrator" || chatMember.status === "creator") {
            await bot.unbanChatMember(chatId, unbanUserId);
            bot.sendMessage(chatId, `✅ کاربر [${unbanUserId}](tg://user?id=${unbanUserId}) رفع مسدودیت شد و می‌تواند دوباره عضو گروه شود.`, { parse_mode: "Markdown" });
        } else {
            bot.sendMessage(chatId, "❌ شما ادمین نیستید و اجازه رفع مسدودیت کاربران را ندارید.");
        }
    } catch (error) {
        bot.sendMessage(chatId, "❌ خطایی رخ داد، مطمئن شوید که ربات دسترسی مدیریت دارد.");
        console.error(error);
    }
});

let warnings = {};

bot.onText(/\/warn (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const mentionedUser = match[1].replace("@", "").trim();

    if (!mentionedUser) {
        bot.sendMessage(chatId, "⚠️ لطفاً @نام‌کاربری فرد را وارد کنید.");
        return;
    }

    const chatMember = await bot.getChatMember(chatId, userId);
    if (chatMember.status !== "administrator" && chatMember.status !== "creator") {
        bot.sendMessage(chatId, "❌ فقط ادمین‌ها می‌توانند هشدار بدهند.");
        return;
    }

    warnings[mentionedUser] = (warnings[mentionedUser] || 0) + 1;

    if (warnings[mentionedUser] >= 3) {
        bot.sendMessage(chatId, `🚨 کاربر @${mentionedUser} به دلیل دریافت ۳ هشدار از گروه حذف شد.`);
        bot.banChatMember(chatId, mentionedUser);
        delete warnings[mentionedUser];
    } else {
        bot.sendMessage(chatId, `⚠️ کاربر @${mentionedUser} هشدار گرفت. تعداد هشدارها: ${warnings[mentionedUser]}/3`);
    }
});

bot.onText(/\/warnings (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const mentionedUser = match[1].replace("@", "").trim();

    if (!mentionedUser) {
        bot.sendMessage(chatId, "⚠️ لطفاً @نام‌کاربری فرد را وارد کنید.");
        return;
    }

    const count = warnings[mentionedUser] || 0;
    bot.sendMessage(chatId, `📊 کاربر @${mentionedUser} تاکنون ${count} هشدار دریافت کرده است.`);
});


bot.onText(/\/clearwarnings (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const mentionedUser = match[1].replace("@", "").trim();

    if (!mentionedUser) {
        bot.sendMessage(chatId, "⚠️ لطفاً @نام‌کاربری فرد را وارد کنید.");
        return;
    }

    warnings[mentionedUser] = 0;
    bot.sendMessage(chatId, `✅ هشدارهای کاربر @${mentionedUser} پاک شد.`);
});

bot.onText(/\/mute (.+) (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const mentionedUser = match[1].replace("@", "").trim();
    const duration = parseInt(match[2]) * 60; // تبدیل دقیقه به ثانیه

    if (!mentionedUser) {
        bot.sendMessage(chatId, "⚠️ لطفاً @نام‌کاربری فرد را وارد کنید.");
        return;
    }

    bot.restrictChatMember(chatId, mentionedUser, {
        can_send_messages: false,
        until_date: Math.floor(Date.now() / 1000) + duration
    });

    bot.sendMessage(chatId, `🔇 کاربر @${mentionedUser} به مدت ${match[2]} دقیقه بی‌صدا شد.`);
});

bot.onText(/\/unmute (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const mentionedUser = match[1].replace("@", "").trim();

    bot.restrictChatMember(chatId, mentionedUser, {
        can_send_messages: true
    });

    bot.sendMessage(chatId, `🔊 کاربر @${mentionedUser} می‌تواند دوباره پیام ارسال کند.`);
});

let lockedFeatures = {
    links: false,
    photos: false,
    videos: false
};

bot.onText(/\/lock (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const feature = match[1].toLowerCase();

    if (!lockedFeatures.hasOwnProperty(feature)) {
        bot.sendMessage(chatId, "⚠️ ویژگی نامعتبر است. مثال: /lock links");
        return;
    }

    lockedFeatures[feature] = true;
    bot.sendMessage(chatId, `🔒 ارسال ${feature} در گروه قفل شد.`);
});

let groupRules = "1️⃣ احترام متقابل داشته باشید.\n2️⃣ ارسال لینک ممنوع است.";

bot.onText(/\/rules/, (msg) => {
    bot.sendMessage(msg.chat.id, `📜 *قوانین گروه:*\n${groupRules}`, { parse_mode: "Markdown" });
});



bot.onText(/\/users/, (msg) => {
    const chatId = msg.chat.id;

    if (msg.from.id !== ADMIN_ID) {
        bot.sendMessage(chatId, "❌ شما دسترسی ندارید.");
        return;
    }

    let userList = users.slice(0, 10).map(userId => `🔹 ${userId}`).join("\n");
    bot.sendMessage(chatId, `👥 تعداد کاربران: ${users.length}\n\n${userList}`);
});

bot.onText(/\/stats/, (msg) => {
    const chatId = msg.chat.id;

    if (msg.from.id !== ADMIN_ID) {
        bot.sendMessage(chatId, "❌ شما دسترسی ندارید.");
        return;
    }

    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);

    bot.sendMessage(chatId, `
📊 *آمار ربات:*
👥 تعداد کاربران: ${users.length}
⏳ زمان فعال بودن: ${hours} ساعت و ${minutes} دقیقه
🔗 سیستم ضد لینک: ${antiLinkEnabled ? "فعال ✅" : "غیرفعال ❌"}
`, { parse_mode: "Markdown" });
});

bot.onText(/\/del/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!msg.reply_to_message) {
        bot.sendMessage(chatId, "⚠️ لطفاً روی پیامی ریپلای کنید تا حذف شود.");
        return;
    }

    try {
        const chatMember = await bot.getChatMember(chatId, userId);
        if (chatMember.status === "administrator" || chatMember.status === "creator") {
            await bot.deleteMessage(chatId, msg.reply_to_message.message_id);
            await bot.deleteMessage(chatId, msg.message_id);
        } else {
            bot.sendMessage(chatId, "❌ شما ادمین نیستید و اجازه حذف پیام‌ها را ندارید.");
        }
    } catch (error) {
        bot.sendMessage(chatId, "❌ خطایی رخ داد، مطمئن شوید که ربات دسترسی مدیریت دارد.");
        console.error(error);
    }
});

bot.onText(/\/editanime (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (userId !== ADMIN_ID) {
        bot.sendMessage(chatId, "❌ شما دسترسی به این دستور ندارید.");
        return;
    }

    const animeName = match[1].toLowerCase().trim();

    if (!animeData[animeName]) {
        bot.sendMessage(chatId, `❌ انیمه *${animeName}* پیدا نشد.`);
        return;
    }

    bot.sendMessage(chatId, `⚙️ شما در حال ویرایش انیمه *${animeName}* هستید. لطفاً گزینه‌ای را انتخاب کنید:`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "✏️ ویرایش نام", callback_data: `edit_name_${animeName}` }],
                [{ text: "🔗 ویرایش لینک‌های دانلود", callback_data: `edit_links_${animeName}` }],
                [{ text: "🎬 ویرایش تعداد قسمت‌ها", callback_data: `edit_episodes_${animeName}` }],
                [{ text: "🗑 حذف انیمه", callback_data: `delete_${animeName}` }]
            ]
        }
    });
});

bot.onText(/\/ping/, (msg) => {
    bot.sendMessage(msg.chat.id, "🏓 Pong! ربات آنلاین است.");
});

bot.onText(/\/uptime/, (msg) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;

    bot.sendMessage(msg.chat.id, `⏳ ربات از زمان راه‌اندازی: ${hours} ساعت، ${minutes} دقیقه و ${seconds} ثانیه فعال بوده است.`);
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

    const query = msg.text.trim().toLowerCase();

    // 1️⃣ ابتدا بررسی کنیم که آیا این انیمه در animeData (یعنی انیمه‌های ذخیره‌شده) وجود دارد؟
    if (animeData[query]) {
        const anime = animeData[query];
        let keyboard = [];

        for (let i = 1; i <= anime.episodes; i++) {
            if (anime.episodesLinks[i]) {
                keyboard.push([{ text: `📥 قسمت ${i}`, url: anime.episodesLinks[i] }]);
            }
        }

        bot.sendMessage(chatId, `🎬 *${query.toUpperCase()}*`, {
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: keyboard }
        });

        return;  // دیگر نیازی به بررسی بقیه موارد نیست
    }

    // 2️⃣ اگر در animeData نبود، لیست ثابت animeLinks را بررسی کن
    const animeLinks = {
        "solo leveling": "https://t.me/Anime_Faarsi",
        "solo leveling 2": "https://t.me/Anime_Faarsi/208",
        "solo leveling session 2": "https://t.me/Anime_Faarsi/208",
        "the eminence in shadow": "https://t.me/Anime_Faarsi/218",
        "the eminence in shadow 2": "https://t.me/Anime_Faarsi/220",
        "invincible": "https://t.me/Anime_Faarsi/222"
    };

    if (animeLinks[query]) {
        bot.sendMessage(chatId, `🎬 *${query.toUpperCase()}*`, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [[{ text: "📺 مشاهده انیمه", url: animeLinks[query] }]]
            }
        });

        return;  // دیگر نیازی به بررسی API نیست
    }

    // 3️⃣ در نهایت اگر در هیچکدام نبود، از API برای جستجوی انیمه استفاده کن
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
    const userId = callback.from.id;
    const data = callback.data;

    // بررسی دسترسی ادمین
    if ((data.startsWith("edit_") || data.startsWith("delete_")) && userId !== ADMIN_ID) {
        bot.sendMessage(chatId, "❌ شما دسترسی به این دستور ندارید.");
        return;
    }

    if (data === "stats") {
        bot.sendMessage(chatId, `📊 تعداد کل کاربران: ${users.length}`);
    } 

    else if (data === "broadcast") {
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
    } 

    else if (data.startsWith("edit_") || data.startsWith("delete_")) {
        const [action, animeName] = data.split("_");

        if (!animeData[animeName] && action !== "delete") {
            bot.sendMessage(chatId, "❌ انیمه موردنظر یافت نشد.");
            return;
        }

        if (action === "edit_name") {
            bot.sendMessage(chatId, `✏️ لطفاً نام جدید انیمه *${animeName}* را وارد کنید:`);
            bot.once("message", (msg) => {
                const newName = msg.text.trim();
                animeData[newName] = animeData[animeName];
                delete animeData[animeName];
                saveAnimeData();
                bot.sendMessage(chatId, `✅ نام انیمه *${animeName}* به *${newName}* تغییر یافت.`);
            });
        } 

        else if (action === "edit_links") {
            bot.sendMessage(chatId, `🔗 لطفاً لینک‌های دانلود را برای قسمت‌های انیمه *${animeName}* ارسال کنید.`);
            bot.once("message", (msg) => {
                const links = msg.text.trim().split("\n");
                animeData[animeName].episodesLinks = links;
                saveAnimeData();
                bot.sendMessage(chatId, `✅ لینک‌های دانلود برای انیمه *${animeName}* ویرایش شد.`);
            });
        } 

        else if (action === "edit_episodes") {
            bot.sendMessage(chatId, `🎬 لطفاً تعداد قسمت‌های انیمه *${animeName}* را وارد کنید:`);
            bot.once("message", (msg) => {
                const episodes = parseInt(msg.text.trim());
                if (isNaN(episodes)) {
                    bot.sendMessage(chatId, "⚠️ تعداد قسمت‌ها باید عدد صحیح باشد.");
                    return;
                }
                animeData[animeName].episodes = episodes;
                saveAnimeData();
                bot.sendMessage(chatId, `✅ تعداد قسمت‌های انیمه *${animeName}* به ${episodes} تغییر یافت.`);
            });
        } 

        else if (action === "delete") {
            delete animeData[animeName];
            saveAnimeData();
            bot.sendMessage(chatId, `🗑 انیمه *${animeName}* با موفقیت حذف شد.`);
        }
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