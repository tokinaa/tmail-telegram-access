require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

const bot = new TelegramBot(process.env.TOKEN_BOT, {
  polling: true,
});

const validateEmail = (email) => {
  // Regex to check if email is valid
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

const getInbox = async (email) => {
  const send = await fetch(
    "https://" +
      process.env.DOMAIN +
      "/api/messages/" +
      email +
      "/" +
      process.env.API_KEY,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
  const res = await send.json();
  return res;
};

bot.on("message", async (msg) => {
  // check if msg is a private message
  if (msg.chat.type != "private") return;

  const chatId = msg.chat.id;
  const from = msg.from;
  const text = msg.text;
  const messageId = msg.message_id;

  // I wanted to create like, /command args
  const args = text.split(" ");
  const command = args.shift().toLowerCase();

  if (command == "/start") {
    if (args.length < 1) {
      bot.sendMessage(chatId, "Bad Request.", { parse_mode: "HTML" });
      return;
    }

    const bundledEmailAndId = args[0];
    const decoded = JSON.parse(
      Buffer.from(bundledEmailAndId, "base64").toString("ascii")
    );

    const inboxs = await getInbox(decoded.email);
    if (inboxs.length == 0) {
      bot.sendMessage(chatId, "No email fetch.");
      return;
    }

    const findEmail = inboxs.find((inbox) => inbox.id == decoded.id);
    if (!findEmail) {
      bot.sendMessage(chatId, "Inbox not found.");
      return;
    }

    const body = findEmail.content.replace(/<[^>]*>?/gm, "").trim();

    let textOutput = `Subject : ${findEmail.subject}\nFrom : ${findEmail.sender_email}\nTo : ${decoded.email}\n\n${body}`;
    bot.sendMessage(chatId, textOutput, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Get Inbox",
              callback_data: `inbox_${bundledEmailAndId}`,
            },
          ],
        ],
      },
    });
  }

  if (command == "/get") {
    // Required arguments : Email
    if (args.length < 1) {
      bot.sendMessage(
        chatId,
        "Please enter your email address. \n\nExample: \n<code>/get [email]</code>",
        { parse_mode: "HTML" }
      );
      return;
    }

    // Check if email is valid
    if (!validateEmail(args[0])) {
      bot.sendMessage(chatId, "Please enter a valid email address.");
      return;
    }

    const email = args[0];

    let textOutput = `Email : ${email}\n\nInbox :\n`;
    const inboxs = await getInbox(email);
    if (inboxs.length == 0) {
      bot.sendMessage(chatId, "No email found.");
      return;
    }

    // Loop through inboxs
    await Promise.all(
      inboxs.map(async (inbox) => {
        const emailId = inbox.id;
        const emailSubject = inbox.subject;

        const bundledEmailAndId = Buffer.from(
          JSON.stringify({
            email: email,
            id: emailId,
          })
        ).toString("base64");

        textOutput += `- [${emailSubject}] | <a href="https://t.me/${process.env.TELEGRAM_USERNAME}?start=${bundledEmailAndId}">View</a>`;
      })
    );

    bot.sendMessage(chatId, textOutput, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Refresh",
              callback_data: `refresh_${email}`,
            },
          ],
        ],
      },
    });
  }
});

bot.on("callback_query", async (callbackQuery) => {
  if (callbackQuery.data.startsWith("inbox")) {
    const bundledEmailAndId = callbackQuery.data.split("_")[1];
    const decoded = JSON.parse(
      Buffer.from(bundledEmailAndId, "base64").toString("ascii")
    );
    const email = decoded.email;

    const inboxs = await getInbox(email);

    let textOutput = `Email : ${email}\n\nInbox :\n`;

    // Loop through inboxs
    await Promise.all(
      inboxs.map(async (inbox) => {
        const emailId = inbox.id;
        const emailSubject = inbox.subject;

        const bundledEmailAndId = Buffer.from(
          JSON.stringify({
            email: email,
            id: emailId,
          })
        ).toString("base64");

        textOutput += `- [${emailSubject}] | <a href="https://t.me/${process.env.TELEGRAM_USERNAME}?start=${bundledEmailAndId}">View</a>`;
      })
    );

    bot.sendMessage(callbackQuery.message.chat.id, textOutput, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Refresh",
              callback_data: `refresh_${email}`,
            },
          ],
        ],
      },
    });

    bot.deleteMessage(
      callbackQuery.message.chat.id,
      callbackQuery.message.message_id
    );
  } else if (callbackQuery.data.startsWith("refresh")) {
    const email = callbackQuery.data.split("_")[1];

    const newInboxs = await getInbox(email);

    let textOutput = `Email : ${email}\n\nInbox :\n`;
    if (newInboxs.length == 0) {
      bot.editMessageText("No email found.", {
        chat_id: callbackQuery.message.chat.id,
        message_id: callbackQuery.message.message_id,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
      return;
    }

    // Loop through inboxs
    await Promise.all(
      newInboxs.map(async (inbox) => {
        const emailId = inbox.id;
        const emailSubject = inbox.subject;

        const bundledEmailAndId = Buffer.from(
          JSON.stringify({
            email: email,
            id: emailId,
          })
        ).toString("base64");

        textOutput += `- [${emailSubject}] | <a href="https://t.me/${process.env.TELEGRAM_USERNAME}?start=${bundledEmailAndId}">View</a>`;
      })
    );

    bot.sendMessage(callbackQuery.message.chat.id, textOutput, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Refresh",
              callback_data: `refresh_${email}`,
            },
          ],
        ],
      },
    });

    bot.deleteMessage(
      callbackQuery.message.chat.id,
      callbackQuery.message.message_id
    );
  }
});
