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
const CHANNEL_LINK = "https://t.me/Anime_Faarsi";
const startTime = Date.now(); // زمان شروع ربات

// راه‌اندازی ربات
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

let blockedUsers = new Set();
let users = loadUsers();
let messages = loadMessages(); // بارگذاری پیام‌ها

let isBotSilentGroup = {}; // وضعیت خاموش یا روشن بودن در گروه‌ها
let isBotSilentPrivate = {}; // وضعیت خاموش یا روشن بودن برای کاربران خصوصی

let animeData = loadAnimeData(); // بارگذاری انیمه‌ها

// تابع ذخیره انیمه‌ها

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

bot.onText(/\/silent/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (msg.chat.type === "private") {
        // در چت خصوصی، هر کاربر خودش می‌تواند ربات را غیرفعال کند
        isBotSilentPrivate[userId] = true;
        bot.sendMessage(chatId, "🤖 ربات در چت خصوصی شما *غیرفعال* شد. برای فعال‌سازی دستور `/active` را ارسال کنید.", { parse_mode: "Markdown" });
    } else {
        // در گروه فقط ادمین‌ها می‌توانند ربات را غیرفعال کنند
        bot.getChatMember(chatId, userId).then((member) => {
            if (member.status === "administrator" || member.status === "creator") {
                isBotSilentGroup[chatId] = true;
                bot.sendMessage(chatId, "🤖 ربات در این گروه *غیرفعال* شد. برای فعال‌سازی دستور `/active` را ارسال کنید.", { parse_mode: "Markdown" });
            } else {
                bot.sendMessage(chatId, "❌ فقط ادمین‌ها می‌توانند ربات را غیرفعال کنند.");
            }
        });
    }
});

bot.onText(/\/active/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (msg.chat.type === "private") {
        isBotSilentPrivate[userId] = false;
        bot.sendMessage(chatId, "✅ ربات در چت خصوصی شما دوباره *فعال* شد.", { parse_mode: "Markdown" });
    } else {
        bot.getChatMember(chatId, userId).then((member) => {
            if (member.status === "administrator" || member.status === "creator") {
                isBotSilentGroup[chatId] = false;
                bot.sendMessage(chatId, "✅ ربات در این گروه دوباره *فعال* شد.", { parse_mode: "Markdown" });
            } else {
                bot.sendMessage(chatId, "❌ فقط ادمین‌ها می‌توانند ربات را فعال کنند.");
            }
        });
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

bot.onText(/\/addanim (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (userId !== ADMIN_ID) {
        bot.sendMessage(chatId, "❌ شما دسترسی ندارید.");
        return;
    }

    const animeName = match[1].toLowerCase().trim();

    if (animeData[animeName]) {
        bot.sendMessage(chatId, `⚠️ انیمه *${animeName}* قبلاً اضافه شده است.`);
        return;
    }

    animeData[animeName] = {
        title: {
            native: animeName, // 👈 اضافه شد ✅
            english: animeName, // 👈 اضافه شد ✅
            romaji: animeName  // 👈 اضافه شد ✅
        },
        description: "",
        episodesLinks: {}
    };

    saveAnimeData();
    bot.sendMessage(chatId, `✅ انیمه *${animeName}* ذخیره شد. حالا با \`/adddes ${animeName} توضیح\` توضیح را اضافه کنید.`, { parse_mode: "Markdown" });
});


bot.onText(/\/addanimep (.+) (.+) (\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (userId !== ADMIN_ID) {
        bot.sendMessage(chatId, "❌ شما دسترسی به این دستور ندارید.");
        return;
    }

    const animeName = match[1].toLowerCase().trim();
    const downloadLink = match[2].trim();
    const episodeNumber = parseInt(match[3]);

    if (!animeData[animeName]) {
        bot.sendMessage(chatId, `❌ انیمه *${animeName}* در لیست ذخیره نشده است. ابتدا از \`/addanim\` استفاده کنید.`, { parse_mode: "Markdown" });
        return;
    }

    // اضافه کردن لینک دانلود به قسمت مشخص‌شده
    animeData[animeName].episodesLinks[episodeNumber] = downloadLink;
    saveAnimeData();

    bot.sendMessage(chatId, `✅ لینک دانلود قسمت ${episodeNumber} از *${animeName}* اضافه شد.`, { parse_mode: "Markdown" });
});

const PREFIXES = ["/", ".", "!"]; // پیشوندهای مجاز

bot.onText(new RegExp(`^(${PREFIXES.map(p => `\\${p}`).join("|")})menu$`), (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, `
📌 *لیست دستورات ربات:*
🔹 \`ping\` - بررسی وضعیت ربات
🔹 \`uptime\` - نمایش مدت زمان فعال بودن ربات
🔹 \`menu\` - مشاهده لیست دستورات

🔹 \`ban\` - مسدود کردن کاربر (فقط ادمین)
🔹 \`unban\` - رفع مسدودیت کاربر (فقط ادمین)
🔹 \`silent\` - غیرفعال کردن ربات در چت
🔹 \`active\` - فعال کردن ربات در چت

🔹 \`users\` - مشاهده لیست کاربران (فقط ادمین)
🔹 \`stats\` - مشاهده آمار ربات (فقط ادمین)
🔹 \`profile\` - مشاهده عکس پروفایل
🔹 \`rules\` - نمایش قوانین گروه

🔹 \`warn @user\` - ارسال هشدار به کاربر
🔹 \`warnings @user\` - مشاهده تعداد هشدارهای یک کاربر
🔹 \`clearwarnings @user\` - پاک کردن هشدارهای یک کاربر

🔹 \`mute @user X\` - بی‌صدا کردن کاربر برای X دقیقه
🔹 \`unmute @user\` - حذف حالت بی‌صدا از کاربر

🔹 \`antilink\` - فعال/غیرفعال کردن ضد لینک
🔹 \`lock [links/photos/videos]\` - قفل کردن ارسال محتوا
🔹 \`del\` - حذف پیام ریپلای شده (فقط ادمین)

🔹 \`addanim name\` - افزودن یک انیمه جدید (فقط ادمین)
🔹 \`addanimep name link episode\` - افزودن لینک دانلود به یک انیمه (فقط ادمین)
🔹 \`editanime name\` - ویرایش اطلاعات انیمه (فقط ادمین)
🔹 \`adddes name\` - ویرایش اطلاعات انیمه (فقط ادمین)
✅ می‌توانید از پیشوندهای *"/", ".", "!"* برای ارسال دستورات استفاده کنید.
`, { parse_mode: "Markdown" });
});

bot.onText(/\/adddes (.+) (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (userId !== ADMIN_ID) {
        bot.sendMessage(chatId, "❌ شما اجازه این کار را ندارید.");
        return;
    }

    const animeName = match[1].toLowerCase().trim();
    const description = match[2].trim();

    if (!animeData[animeName]) {
        bot.sendMessage(chatId, `❌ انیمه *${animeName}* در لیست نیست. اول از \`/addanim\` استفاده کنید.`, { parse_mode: "Markdown" });
        return;
    }

    animeData[animeName].description = description;
    saveAnimeData();

    bot.sendMessage(chatId, `✅ توضیح برای انیمه *${animeName}* ذخیره شد.`, { parse_mode: "Markdown" });
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

    let descriptionText = animeData[animeName].description
        ? `📖 *توضیح:* ${animeData[animeName].description}\n\n`
        : "❌ توضیحی برای این انیمه ثبت نشده است.\n\n";

    let linksText = "📥 *لینک‌های دانلود:*\n";
    let keyboard = [];

    for (let i = 1; i <= Object.keys(animeData[animeName].episodesLinks).length; i++) {
        if (animeData[animeName].episodesLinks[i]) {
            linksText += `🔹 قسمت ${i}: ${animeData[animeName].episodesLinks[i]}\n`;
            keyboard.push([{ text: `📥 قسمت ${i}`, url: animeData[animeName].episodesLinks[i] }]);
        }
    }

    bot.sendMessage(chatId, `⚙️ شما در حال ویرایش انیمه *${animeName}* هستید.\n\n${descriptionText}${linksText}`, {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: "✏️ ویرایش نام", callback_data: `edit_name_${animeName}` }],
                [{ text: "📖 ویرایش توضیح", callback_data: `edit_description_${animeName}` }], // 👈 اضافه شد
                [{ text: "🔗 ویرایش لینک‌های دانلود", callback_data: `edit_links_${animeName}` }],
                [{ text: "🎬 ویرایش تعداد قسمت‌ها", callback_data: `edit_episodes_${animeName}` }],
                [{ text: "🗑 حذف انیمه", callback_data: `delete_${animeName}` }]
            ].concat(keyboard)
        }
    });
});

bot.on("callback_query", async (callback) => {
    const chatId = callback.message.chat.id;
    const data = callback.data;

    if (data.startsWith("edit_")) {
        const parts = data.split("_");
        const action = parts[1];
        const animeName = parts.slice(2).join("_").toLowerCase(); // 👈 اصلاح شد ✅

        console.log("Anime Data:", animeData); // برای تست
        console.log("Requested Anime:", animeName); // برای تست

        if (!animeData[animeName]) {
            bot.sendMessage(chatId, `❌ انیمه *${animeName}* یافت نشد.`);
            return;
        }

        if (action === "description") {
            bot.sendMessage(chatId, `📖 لطفاً توضیح جدید برای انیمه *${animeName}* را ارسال کنید:`);
            bot.once("message", (msg) => {
                animeData[animeName].description = msg.text.trim();
                saveAnimeData();
                bot.sendMessage(chatId, `✅ توضیح انیمه *${animeName}* ذخیره شد.`);
            });
        }
    }
});

bot.onText(/\/ping/, (msg) => {
    bot.sendMessage(msg.chat.id, "🏓 Pong! ربات آنلاین است.");
});

bot.onText(/\/pinng/, (msg) => {
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
const TELEGRAM_API_ID = '21305055';
const TELEGRAM_API_HASH = '450c6ab2f7176fcfed4a8fe512ff83f4';
const CHANNEL_LINK = 'https://t.me/Anime_Faarsi'; // لینک کانال

const { TelegramClient } = require('telethon');
const { StringSession } = require('telethon/sessions');

// ربات تلگرام شما
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!msg.text || msg.text.startsWith("/")) return;

    // **اگر ربات در گروه غیرفعال باشد، هیچ پاسخی ارسال نکند**
    if (msg.chat.type !== "private" && isBotSilentGroup[chatId]) return;

    // **اگر ربات در چت خصوصی کاربر غیرفعال باشد، هیچ پاسخی ارسال نکند**
    if (msg.chat.type === "private" && isBotSilentPrivate[userId]) return;

    const query = msg.text.trim().toLowerCase();

    // **جستجو در کانال برای پست‌های مرتبط با انیمه**
    const animePost = await getAnimePostFromChannel(query);
    if (animePost) {
        let keyboard = [];

        // استخراج قسمت‌ها و لینک‌های دانلود
        const episodeLinks = extractEpisodeLinks(animePost);
        for (let i = 0; i < episodeLinks.length; i++) {
            keyboard.push([{ text: `📥 قسمت ${i + 1}`, url: episodeLinks[i] }]);
        }

        bot.sendMessage(chatId, `🎬 *${animePost.title}*\n\n` +
            `📅 *سال انتشار:* ${animePost.releaseYear}\n📊 *امتیاز:* ${animePost.rating}\n🎭 *ژانر:* ${animePost.genre}\n\n` +
            `🔻 *برای دانلود روی دکمه‌های پایین کلیک کنید:*`,
            {
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: keyboard }
            }
        );
        return;
    }

    // اگر انیمه پیدا نشد
    bot.sendMessage(chatId, "انیمه‌ای با این نام پیدا نشد.");
});

// تابع برای گرفتن پست‌های کانال
async function getAnimePostFromChannel(query) {
    const client = new TelegramClient(new StringSession(''), TELEGRAM_API_ID, TELEGRAM_API_HASH);
    await client.start();

    const channel = await client.getEntity(CHANNEL_LINK);
    const posts = await client.getMessages(channel, { limit: 10 });

    // جستجوی پست‌ها بر اساس query
    return posts.find(post => post.text && post.text.toLowerCase().includes(query));
}

// تابع برای استخراج لینک‌های قسمت‌ها از پست
function extractEpisodeLinks(post) {
    const links = [];
    const regex = /🔻 Eposide_\d+/g;  // شبیه‌سازی برای پیدا کردن لینک‌ها
    let match;
    while (match = regex.exec(post.text)) {
        const link = post.text.match(`🔻 ${match[0]} - ([^ ]+)`);
        if (link && link[1]) {
            links.push(link[1]);
        }
    }
    return links;
}
// مدیریت دکمه‌های ادمین
bot.on("callback_query", async (callback) => {
    const chatId = callback.message.chat.id;
    const userId = callback.from.id;
    const data = callback.data;

    if (data.startsWith("edit_") || data.startsWith("delete_")) {
        const [action, animeName] = data.split("_");

        if (!animeData[animeName] && action !== "delete") {
            bot.sendMessage(chatId, "❌ انیمه موردنظر یافت نشد.");
            return;
        }

        if (action === "edit_name") {
            bot.sendMessage(chatId, `✏️ لطفاً نام جدید انیمه *${animeName}* را ارسال کنید:`);
            bot.once("message", (msg) => {
                const newName = msg.text.trim();
                bot.sendMessage(chatId, `⚠️ آیا مطمئن هستید که نام انیمه *${animeName}* به *${newName}* تغییر کند؟`, {
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "✅ بله", callback_data: `confirm_edit_name_${animeName}_${newName}` }],
                            [{ text: "❌ خیر", callback_data: "cancel" }]
                        ]
                    }
                });
            });
        }

        else if (action === "edit_description") {
            bot.sendMessage(chatId, `📖 لطفاً توضیح جدید برای انیمه *${animeName}* را ارسال کنید:`);
            bot.once("message", (msg) => {
                const newDescription = msg.text.trim();
                bot.sendMessage(chatId, `⚠️ آیا مطمئن هستید که توضیح انیمه *${animeName}* تغییر کند؟`, {
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "✅ بله", callback_data: `confirm_edit_description_${animeName}_${newDescription}` }],
                            [{ text: "❌ خیر", callback_data: "cancel" }]
                        ]
                    }
                });
            });
        }

        else if (action === "edit_links") {
            bot.sendMessage(chatId, `🔗 لطفاً لینک‌های جدید دانلود برای انیمه *${animeName}* را ارسال کنید:`);
            bot.once("message", (msg) => {
                const newLinks = msg.text.trim();
                bot.sendMessage(chatId, `⚠️ آیا مطمئن هستید که لینک‌های انیمه *${animeName}* تغییر کند؟`, {
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "✅ بله", callback_data: `confirm_edit_links_${animeName}_${newLinks}` }],
                            [{ text: "❌ خیر", callback_data: "cancel" }]
                        ]
                    }
                });
            });
        }

        else if (action === "delete") {
            bot.sendMessage(chatId, `⚠️ آیا مطمئن هستید که انیمه *${animeName}* حذف شود؟`, {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✅ بله", callback_data: `confirm_delete_${animeName}` }],
                        [{ text: "❌ خیر", callback_data: "cancel" }]
                    ]
                }
            });
        }
    }
});

bot.on("callback_query", (callback) => {
    const chatId = callback.message.chat.id;
    const data = callback.data;

    if (data.startsWith("confirm_")) {
        const parts = data.split("_");
        const action = parts[1];
        const animeName = parts.slice(2).join("_").toLowerCase(); // 👈 اصلاح شد ✅

        if (action === "edit" && parts[3] === "name") {
            const newName = parts.slice(4).join("_");
            animeData[newName] = animeData[animeName];
            delete animeData[animeName];
            saveAnimeData();
            bot.sendMessage(chatId, `✅ نام انیمه *${animeName}* به *${newName}* تغییر یافت.`);
        } 

        else if (action === "edit" && parts[3] === "description") {
            const newDescription = parts.slice(4).join("_");
            animeData[animeName].description = newDescription;
            saveAnimeData();
            bot.sendMessage(chatId, `✅ توضیح انیمه *${animeName}* تغییر کرد.`);
        }

        else if (action === "edit" && parts[3] === "links") {
            const newLinks = parts.slice(4).join("_");
            animeData[animeName].episodesLinks = newLinks.split("\n");
            saveAnimeData();
            bot.sendMessage(chatId, `✅ لینک‌های دانلود انیمه *${animeName}* تغییر کرد.`);
        }

        else if (action === "delete") {
            delete animeData[animeName];
            saveAnimeData();
            bot.sendMessage(chatId, `🗑 انیمه *${animeName}* حذف شد.`);
        }
    } 

    else if (data === "cancel") {
        bot.sendMessage(chatId, "✅ عملیات لغو شد.");
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
        const anime = response.data.data.Media;

        if (anime) {
            const animeName = anime.title.romaji.toLowerCase();

            // **ذخیره در animeData در صورتی که قبلاً وجود نداشته باشد**
            if (!animeData[animeName]) {
                animeData[animeName] = {
                    title: anime.title.romaji,
                    english: anime.title.english || "ناموجود",
                    native: anime.title.native || "ناموجود",
                    episodes: anime.episodes || 0,
                    year: anime.seasonYear || "نامشخص",
                    genres: anime.genres || [],
                    averageScore: anime.averageScore || 0,
                    coverImage: anime.coverImage.large || "",
                    episodesLinks: {} // هنوز لینک دانلود ندارد
                };
                saveAnimeData();
            }

            return anime;
        } else {
            return null;
        }
    } catch (error) {
        console.error("❌ خطا در دریافت اطلاعات انیمه:", error);
        return null;
    }
}

console.log("✅ ربات فعال شد...");

// Render نیاز به یک پورت باز دارد
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});