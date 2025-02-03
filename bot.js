import TelegramBot from "node-telegram-bot-api";
import catalog from "./catalog.js";
import showcase from "./showcase.js";
import connectToDatabase from "./db.js";
import { addShowcaseItem, editShowcaseItem } from "./showcase.js";
import { MongoClient } from "mongodb";
import { Calendar } from "telegram-inline-calendar";
import createCalendar from "./calendarFunc.js";
import cors from "cors";
import express from "express";
import {
  startAddProcess,
  cancelProcess,
  startEditProcess,
} from "./processes/processes.js";
import validateAddress, {
  getAddressFromCoordinates,
} from "./validateAddress.js";
// Вставьте токен вашего бота
const BOT_TOKEN = "7067793712:AAG-q70twwvhpCN9M3a2_qAwmLfFXdZg32A";
const app = express();
import { RobokassaHelper } from "node-robokassa";

const robokassaHelper = new RobokassaHelper({
  // REQUIRED OPTIONS:
  merchantLogin: "Florimnodi",
  hashingAlgorithm: "md5",
  password1: "kNs2f8goXOWGY7AU0s2k",
  password2: "pE4fu3bO2qglZCa3dI5T",

  // OPTIONAL CONFIGURATION
  testMode: true, // Whether to use test mode globally
  resultUrlRequestMethod: "POST", // HTTP request method selected for "ResultURL" requests
});
app.use(cors());
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get("/result", (req, res) => {
  console.log("Hello World!");

  return res
    .status(200)
    .json({ message: "Transaction completed successfully" });
});
app.get("/fail", (req, res) => {
  return res.status(200).json({ message: "Transaction failed" });
});
app.post("/payment-success", (req, res) => {
  console.log("payment-success", req.body);

  const result = robokassaHelper.handleResultUrlRequest(
    req,
    res,
    function (values, userData) {
      console.log({
        values: values, // Will contain general values like "invId" and "outSum"
        userData: userData, // Will contain all your custom data passed previously, e.g.: "productId"
      });
      console.log(values);
      return { values, userData };
    }
  );
  console.log("payment-success2", result);
});

import crypto from "crypto";
import { URLSearchParams } from "url";

function calculateSignature(...args) {
  console.log("ARGS", ...args);

  const hash = crypto.createHash("md5");
  const data = args.map(String).join(":");
  hash.update(data);

  return hash.digest("hex");
}

let db;
let collectionUser;
let collectionProduct;

MongoClient.connect(
  "mongodb+srv://quard:Screaper228@cluster0.zyg0fil.mongodb.net/?retryWrites=true&w=majority",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
)
  .then((client) => {
    db = client.db();
    collectionUser = db.collection("dbUser");
    collectionProduct = db.collection("db1");
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("Error connecting to MongoDB", err);
  });

// Функция обработки фото
async function handlePhoto(userId, photoFileId) {
  const user = await collectionUser.findOne({ userId });
  console.log(user.step);

  if (user && user.step === "getIndex") {
    return "Пожалуйста, отправьте номер предмета, который хотите отредактировать.";
  }
  if (!user || user.step !== "getPhoto") {
    return;
  }

  // Сохранение фото в базе данных
  await collectionUser.updateOne({ userId }, { $set: { photo: photoFileId } });

  // Обновляем шаг процесса
  await collectionUser.updateOne({ userId }, { $set: { step: "getPrice" } });

  return "Фото получено! Теперь отправьте цену товара.";
}

// Функция обработки цены
async function handlePrice(userId, priceText) {
  const price = parseFloat(priceText);
  if (isNaN(price) || price <= 0) {
    return "Пожалуйста, отправьте корректную цену товара. Например: 100, 199.99";
  }

  const user = await collectionUser.findOne({ userId });
  if (!user || user.step !== "getPrice") {
    return;
  }

  // Сохранение цены в базе данных
  await collectionUser.updateOne({ userId }, { $set: { price } });

  // Сохранение товара в коллекцию продуктов
  const userPhoto = user.photo;
  if (user.processType === "edit") {
    const productId = user.productId;
    await collectionProduct.updateOne(
      { _id: productId },
      {
        $set: {
          photo: userPhoto,
          price: price,
          addedAt: new Date(),
        },
      }
    );
    await collectionUser.updateOne(
      { userId },
      {
        $set: {
          isInProcess: false,
          step: null,
          processType: null,
          photo: null,
          price: null,
        },
      }
    );
    return "Товар успешно обновлен в базе данных!";
  }
  await collectionProduct.insertOne({
    photo: userPhoto,
    price: price,
    addedAt: new Date(),
  });

  // Завершаем процесс добавления товара
  await collectionUser.updateOne(
    { userId },
    {
      $set: {
        isInProcess: false,
        step: null,
        processType: null,
        photo: null,
        price: null,
      },
    }
  );

  return "Товар успешно добавлен в базу данных!";
}

// Функция для редактирования товара по индексу
async function handleEdit(userId, index) {
  const user = await collectionUser.findOne({ userId });
  if (!user || user.processType !== "edit") {
    return;
  }

  if (isNaN(index) || index <= 0 || index > 100) {
    return "Пожалуйста, укажите корректный порядковый номер товара.";
  }
  const indexInt = parseInt(index);
  const document = await collectionProduct
    .find()
    .skip(indexInt - 1)
    .limit(1)
    .next();
  if (!document) {
    return "Предмет с таким индексом не найден. Попробуйте снова.";
  }

  await collectionUser.updateOne(
    { userId },
    { $set: { step: "getPhoto", productId: document._id } }
  );

  return "Предмет найден! Отправьте новое фото товара.";
}
bot.onText(/\/test/, (msg) => {
  const chatId = msg.chat.id;
  try {
    // Пример значений

    const login = "Florimnodi"; // Ваш логин
    const outSum = 110; // Сумма платежа

    const invDesc = "Custom transaction description message";

    // Optional options.
    const options = {
      invId: 100500, // Your custom order ID
      email: "email@example.com", // E-Mail of the paying user
      outSumCurrency: "USD", // Transaction currency
      isTest: true, // Whether to use test mode for this specific transaction
      userData: {
        // You could pass any additional data, which will be returned to you later on
        productId: "1337",
        username: "testuser",
      },
    };

    const paymentUrl = robokassaHelper.generatePaymentUrl(
      outSum,
      invDesc,
      options
    );

    // Отправка ссылки пользователю
    bot.sendMessage(chatId, `Нажмите на ссылку для оплаты: ${paymentUrl}`);
  } catch (e) {
    console.log(e);
  }
});

bot.onText(/\/location/, (msg) => {
  const chatId = msg.chat.id;

  // Отправляем кнопку для отправки местоположения
  bot.sendMessage(chatId, "Пожалуйста, отправьте свое местоположение", {
    reply_markup: {
      keyboard: [
        [
          {
            text: "Отправить местоположение",
            request_location: true, // Это запрос местоположения
          },
        ],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
});
bot.on("location", async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;
  console.log("locaton");
  if (!collectionUser) {
    return;
  }
  const user = await collectionUser.findOne({ userId: chatId });
  if (!user) {
    return;
  }
  if (user.processType === "send_location") {
    const address = await getAddressFromCoordinates(latitude, longitude);
    if (
      address !==
      "К сожалению, мы не можем найти ваш адрес. Пожалуйста, убедитесь, что адрес находится в Москве и вы указываете точное местоположение."
    ) {
      console.log(address);
      await bot.sendMessage(
        chatId,
        `Ваш адрес: ${address}\n` + "Теперь укажите примерное время доставки",
        {
          reply_markup: {
            keyboard: [
              ["9-11", "12-14"],
              ["15-17", "18-20", "20-21"],
              ["Назад"],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
      await collectionUser.updateOne(
        { userId: chatId },
        { $set: { address, processType: "select_time" } }
      );
    } else {
      await bot.sendMessage(chatId, address);
    }
    // Обновление статуса пользователя
  }

  //   bot.sendLocation(chatId, latitude, longitude);
});
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const address = await validateAddress("Днепр, массив Тополь-3, 20");
  if (address) {
    console.log(address);
  }
  if (!collectionUser) {
    return;
  }
  const currentUser = await collectionUser.findOne({ userId: chatId });
  if (!currentUser) {
    await collectionUser.updateOne(
      { userId: chatId },
      {
        $set: {
          isInProcess: false,
          step: null,
          processType: null,
          photo: null,
          price: null,
        },
      },
      { upsert: true }
    );
  }
  if (currentUser && currentUser.isInProcess) {
    await bot.sendMessage(
      chatId,
      "Вы не можете начать новое действие, пока не завершите текущее."
    );
    return;
  }
  // Приветственное сообщение с использованием Markdown
  await bot.sendMessage(
    chatId,
    "*Добро пожаловать!*\n\n" +
      "Это ваш помощник.\n\n" +
      "- Мы предлагаем:\n" +
      "  1. Отличное качество\n" +
      "  2. Удобные заказы\n\n" +
      "_Спасибо, что выбрали нас!_",
    { parse_mode: "Markdown" }
  );

  // Сообщение с кнопками
  await bot.sendMessage(chatId, "Что хотите сделать?", {
    reply_markup: {
      keyboard: [
        ["О нас", "Наш сайт"], // Кнопки в одном ряду
        ["Мы на карте", "Онлайн-витрина"], // Кнопки во втором ряду
        ["Наш каталог"], // Кнопка в третьем ряду
      ],
      resize_keyboard: true, // Делает кнопки компактными
      one_time_keyboard: true, // Убирает клавиатуру после нажатия
    },
  });
});
// Обработчик команды /add
bot.onText(/\/add/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!collectionUser) {
    return;
  }

  const user = await collectionUser.findOne({ userId });
  if (user && user.isInProcess) {
    await bot.sendMessage(
      chatId,
      "Вы не можете начать новое действие, пока не завершите текущее.",
      {
        reply_markup: {
          keyboard: [["Назад"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
    );
    return;
  }
  const message = await startAddProcess(userId, collectionUser);

  bot.sendMessage(chatId, message, {
    reply_markup: {
      keyboard: [["Назад"]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
});

// Обработчик команды /edit
bot.onText(/\/edit/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!collectionUser) {
    return;
  }
  const user = await collectionUser.findOne({ userId });
  if (user && user.isInProcess) {
    await bot.sendMessage(
      chatId,
      "Вы не можете начать новое действие, пока не завершите текущее."
    );
    return;
  }
  const message = await startEditProcess(userId, collectionUser);

  await bot.sendMessage(chatId, message, {
    reply_markup: {
      keyboard: [["Назад"]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
});

// Обработчик кнопки "Назад"
bot.on("text", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim();
  if (!collectionUser) {
    return;
  }
  const user = await collectionUser.findOne({ userId });

  if (text === "Назад") {
    if (
      (user && user.processType === "catalog_price=4000") ||
      user.processType === "catalog_price=8000" ||
      user.processType === "catalog_price=15000"
    ) {
      const message = await cancelProcess(userId, collectionUser);
      bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [
            ["До 4.000₽"],
            ["4.0000₽-8.000₽"],
            ["8.000₽-15.000₽"],
            ["Назад"],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return;
    }
    if (user && user.processType && user.processType === "payment") {
      const message = await cancelProcess(userId, collectionUser);
      bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [["Перейти к оплате"], ["Назад"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return;
    }
    if (user && user.processType && user.processType === "extra_information") {
      const message = await cancelProcess(userId, collectionUser);
      bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [["Назад"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return;
    }
    if (user && user.processType && user.processType === "recipient_number") {
      const message = await cancelProcess(userId, collectionUser);
      bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [["9-11", "12-14"], ["15-17", "18-20", "20-21"], ["Назад"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return;
    }
    if (
      (user && user.processType && user.processType === "send_location") ||
      (user && user.processType && user.processType === "enter_address") ||
      (user && user.processType && user.processType === "select_time")
    ) {
      const message = await cancelProcess(userId, collectionUser);
      bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [
            ["Отправить локацию"],
            ["Ввести адрес", "Самовывоз"],
            ["Назад"],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return;
    } else {
      const message = await cancelProcess(userId, collectionUser);
      bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [
            ["О нас", "Наш сайт"], // Кнопки в одном ряду
            ["Мы на карте", "Онлайн-витрина"], // Кнопки во втором ряду
            ["Наш каталог"], // Кнопка в третьем ряду
          ],
          resize_keyboard: true, // Делает кнопки компактными
          one_time_keyboard: true, // Убирает клавиатуру после нажатия
        },
      });
    }
  }
});

// Обработчик фотографий
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const user = await collectionUser.findOne({ userId });

  if (user && user.step === "getIndex") {
    return bot.sendMessage(
      chatId,
      "Пожалуйста, отправьте номер предмета, который хотите отредактировать."
    );
  }
  if (user && user.step !== "getPhoto") {
    return;
  }

  const photo = msg.photo[msg.photo.length - 1];
  const fileId = photo.file_id;

  const message = await handlePhoto(userId, fileId);
  bot.sendMessage(chatId, message);
});

// Обработчик текстовых сообщений (для получения цены товара)
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!collectionUser || !collectionProduct) {
    return;
  }

  const user = await collectionUser.findOne({ userId });
  if (!user || !user.isInProcess) {
    return; // Не обрабатываем, если пользователь не в процессе
  }

  if (
    user.step === "getPhoto" &&
    msg.text !== "Назад" &&
    msg.text &&
    msg.text !== "/add" &&
    msg.text !== "/edit"
  ) {
    setTimeout(
      () => bot.sendMessage(chatId, "Пожалуйста, отправьте фото товара."),
      300
    );
  } else if (
    user.step === "getPrice" &&
    msg.text !== "Назад" &&
    msg.text &&
    msg.text !== "/add" &&
    msg.text !== "/edit" &&
    msg.text[0] !== "/"
  ) {
    const message = await handlePrice(userId, msg.text);
    if (
      message ===
      "Пожалуйста, отправьте корректную цену товара. Например: 100, 199.99"
    ) {
      bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [["Назад"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    } else {
      bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [
            ["О нас", "Наш сайт"],
            ["Мы на карте", "Онлайн-витрина"],
            ["Наш каталог"],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    }
  } else if (
    user.step === "getIndex" &&
    msg.text !== "Назад" &&
    msg.text &&
    msg.text !== "/add" &&
    msg.text !== "/edit" &&
    msg.text[0] !== "/"
  ) {
    const message = await handleEdit(userId, msg.text);
    bot.sendMessage(chatId, message);
  }
});

const calendar = new Calendar(bot, {
  date_format: "DD-MM-YYYY",
  language: "ru",
});
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;

  if (!collectionUser || !collectionProduct) {
    console.log("collectionUser or collectionProduct is null");
    return;
  }

  const user = await collectionUser.findOne({ userId });

  if (
    !user ||
    (user.isInProcess &&
      user.processType !== "showcase" &&
      user.processType !== "select_date" &&
      user.processType !== "prepare_address" &&
      user.processType !== "send_location" &&
      user.processType !== "enter_address" &&
      user.processType !== "select_time" &&
      user.processType !== "recipient_number" &&
      user.processType !== "extra_information" &&
      user.processType !== "catalog" &&
      user.processType !== "catalog_price=4000" &&
      user.processType !== "catalog_price=8000" &&
      user.processType !== "catalog_price=15000" &&
      user.processType !== "payment")
  ) {
    console.log("User is in process");

    return; // Не обрабатываем, если пользователь в процессе
  }

  try {
    if (text === "Онлайн-витрина") {
      const products = await collectionProduct
        .find({ photo: { $exists: true } })
        .toArray();

      if (products.length === 0) {
        await bot.sendMessage(chatId, "Нет фото для отображения.");
        return;
      }

      const mediaGroup = products
        .filter((product) => product.photo)
        .map((product, index) => ({
          type: "photo",
          media: product.photo,
          caption: `№${index + 1}: ${product.price || "Без цены"} ₽`,
        }))
        .slice(0, 6);

      await bot.sendMediaGroup(chatId, mediaGroup);

      await collectionUser.updateOne(
        { userId },
        { $set: { processType: "showcase", isInProcess: true } }
      );

      const keyboard = products
        .slice(0, 6)
        .map((product, index) => [
          `№${index + 1} ${
            product.price ? `- ${product.price} ₽` : "Без цены"
          }`,
        ]);

      keyboard.push(["Назад"]);

      await bot.sendMessage(
        chatId,
        "Это наша онлайн-витрина. Выберите товар:",
        {
          reply_markup: {
            keyboard,
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
    } else if (text.startsWith("№") && user.processType === "showcase") {
      const productIndex = parseInt(text.match(/№(\d+)/)[1], 10) - 1;
      const product = await collectionProduct
        .find({ photo: { $exists: true } })
        .skip(productIndex)
        .limit(1)
        .toArray();

      if (!product.length) {
        await bot.sendMessage(chatId, "Товар не найден.");
        return;
      }

      const selectedProduct = product[0];

      await collectionUser.updateOne(
        { userId },
        { $set: { selectedProduct, processType: "select_date" } }
      );

      await calendar.startNavCalendar(
        msg,
        `Вы выбрали: №${productIndex + 1} - ${
          selectedProduct.price || "Без цены"
        } ₽.\nУкажите дату или выберите её из календаря:`
      );
    } else if (user.processType === "prepare_address") {
      // Сохранение адреса
      if (text === "Самовывоз") {
        await collectionUser.updateOne(
          { userId },
          { $set: { address: "Самовывоз", processType: "select_time" } }
        );
        await bot.sendMessage(
          chatId,
          "Теперь укажите примерное время во сколько вы заберете товар",
          {
            reply_markup: {
              keyboard: [
                ["9-11", "12-14"],
                ["15-17", "18-20", "20-21"],
                ["Назад"],
              ],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
      } else if (text === "Отправить локацию") {
        await bot.sendMessage(
          chatId,
          "📍 *Как отправить локацию через Telegram:*\n\n" +
            "1️⃣ *Нажмите на иконку скрепки 📎 (в нижнем левом углу экрана).*\n" +
            '2️⃣ *Выберите пункт "Местоположение" из предложенных вариантов.*\n' +
            "3️⃣ *Убедитесь, что ваше устройство имеет доступ к данным о местоположении.*\n" +
            '4️⃣ *Telegram предложит отправить ваше текущее местоположение. Нажмите "Отправить свою геопозицию".*\n\n' +
            '5️⃣ *Если вы хотите указать адрес вручную на карте, выберите "Выбрать точку на карте" и отметьте нужное место.*\n\n' +
            "📱 *Данная функция доступна только на мобильных устройствах.*",
          {
            parse_mode: "Markdown",
          }
        );
        await bot.sendMessage(chatId, "Пожалуйста, отправьте свою локацию.", {
          reply_markup: {
            keyboard: [["Назад"]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        // Обновление статуса пользователя в процессе
        await collectionUser.updateOne(
          { userId },
          { $set: { isInProcess: true, processType: "send_location" } }
        );
      }
      // Если пользователь выбрал путь через текстовый адрес
      else if (text === "Ввести адрес") {
        await bot.sendMessage(
          chatId,
          "*Пожалуйста, введите свой адрес в следующем формате:*\n\n" +
            "*Город, Улица, Дом* (через запятую, с большой буквы).\n\n" +
            "*Пример:*\n" +
            "'Москва, Тверская улица, 7'.",
          {
            parse_mode: "Markdown",
            reply_markup: {
              keyboard: [["Назад"]],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );

        // Обновление статуса пользователя в процессе
        await collectionUser.updateOne(
          { userId },
          { $set: { isInProcess: true, processType: "enter_address" } }
        );
      }
    } else if (user.processType === "enter_address" && text !== "Назад") {
      const validationResponse = await validateAddress(text);
      console.log(validationResponse.message, validationResponse.valid);

      if (validationResponse.valid) {
        await collectionUser.updateOne(
          { userId },
          { $set: { address: text, processType: "select_time" } }
        );
        bot.sendMessage(chatId, "Адрес найден. Теперь укажите время доставки", {
          reply_markup: {
            keyboard: [
              ["9-11", "12-14"],
              ["15-17", "18-20", "20-21"],
              ["Назад"],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
      } else {
        bot.sendMessage(
          chatId,
          "Адрес не найден. Пожалуйста, попробуйте изменить адрес ",
          {
            reply_markup: {
              keyboard: [["Назад"]],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
      }

      // Обновление статуса пользователя в процессе
    } else if (user.processType === "select_time" && text !== "Назад") {
      await collectionUser.updateOne(
        { userId },
        { $set: { time: text, processType: "recipient_number" } }
      );
      bot.sendMessage(
        chatId,
        "Время доставки выбрано. Теперь укажите номер телефона  получателя",
        {
          reply_markup: {
            keyboard: [["Назад"]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
    } else if (user.processType === "recipient_number" && text !== "Назад") {
      const phoneRegex =
        /^(\+7|8)\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}$/;
      if (!phoneRegex.test(text)) {
        return bot.sendMessage(
          chatId,
          "Неверный формат номера телефона. Пожалуйста, попробуйте еще раз.",
          {
            reply_markup: {
              keyboard: [["Назад"]],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
      }
      await collectionUser.updateOne(
        { userId },
        { $set: { recipientNumber: text, processType: "extra_information" } }
      );
      bot.sendMessage(
        chatId,
        "Номер телефона получателя выбран. Теперь при желании укажите дополнительную информацию о заказе или нажмите кнопку 'Перейти к оплате'",
        {
          reply_markup: {
            keyboard: [["Перейти к оплате"], ["Назад"]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
    } else if (
      user.processType === "extra_information" &&
      text !== "Назад" &&
      text !== "Перейти к оплате"
    ) {
      await collectionUser.updateOne(
        { userId },
        { $set: { extraInformation: text, processType: "payment" } }
      );
      bot.sendMessage(
        chatId,
        "Дополнительная информация о заказе сохранена. Перейдите к оплате.",
        {
          reply_markup: {
            keyboard: [["Перейти к оплате"], ["Назад"]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
    } else if (
      user.processType === "extra_information" &&
      text === "Перейти к оплате" &&
      text !== "Назад"
    ) {
      await collectionUser.updateOne(
        { userId },
        { $set: { processType: "payment" } }
      );
      await bot.sendMessage(chatId, "Логика оплаты...", {
        reply_markup: {
          keyboard: [["Назад"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    } else if (user.processType === "payment" && text !== "Назад") {
      bot.sendMessage(chatId, "логика оплаты...");
    } else if (text !== "Назад") {
      //   await bot.sendMessage(
      //     chatId,
      //     "К сожалению, я не понимаю эту команду. Выберите действие из предложенных кнопок."
      //   );
    }
  } catch (error) {
    console.error("Ошибка при обработке текстового сообщения:", error);
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  if (!collectionUser) {
    return;
  }
  const user = await collectionUser.findOne({ userId });
  if (
    user &&
    user.isInProcess &&
    user.processType !== "about" &&
    user.processType !== "site" &&
    user.processType !== "catalog" &&
    user.processType !== "catalog_price=4000" &&
    user.processType !== "catalog_price=8000" &&
    user.processType !== "catalog_price=15000"
  ) {
    return;
  } else if (text === "О нас") {
    await collectionUser.updateOne(
      { userId },
      { $set: { isInProcess: true, processType: "about" } }
    );
    const text = `
✨ Flori Mondi – ваш премиальный цветочный салон с безупречным сервисом, быстрыми доставками и роскошным бутиком в самом сердце Москвы. 

🌷 Мы создаем не просто букеты, а моменты счастья, где каждый лепесток пропитан заботой. Наши флористы сделали всё, чтобы процесс заказа стал максимально удобным и приятным для вас. 

🌸 С нами вы забудете о волнениях: свежесть цветов, точность доставки и безупречная сборка — это наша зона ответственности. Перед отправкой мы всегда согласуем финальный вид букета с вами и готовы учесть любые ваши пожелания. 

💌 Хотите положить к букету шоколадку, подписать открытку или доставить его анонимно? Для нас нет невыполнимых задач! Мы гордимся тем, что можем воплощать в жизнь даже самые нестандартные запросы, доказывая вам, что выбор Flori Mondi — это всегда правильное решение. 

🌟 Мы здесь, чтобы создавать радость для вас и ваших близких.
`;
    bot.sendMessage(chatId, text, {
      reply_markup: {
        keyboard: [["Назад"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  } else if (text === "Наш сайт") {
    await collectionUser.updateOne(
      { userId },
      { $set: { isInProcess: true, processType: "site" } }
    );

    bot.sendMessage(chatId, "www.florimondi.ru/about/", {
      reply_markup: {
        keyboard: [["Назад"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  } else if (text === "Наш каталог") {
    await collectionUser.updateOne(
      { userId },
      { $set: { isInProcess: true, processType: "catalog" } }
    );
    bot.sendMessage(chatId, "Выберете диапазон цен ", {
      reply_markup: {
        keyboard: [
          ["До 4.000₽"],
          ["4.0000₽-8.000₽"],
          ["8.000₽-15.000₽"],
          ["Назад"],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }
  if (text === "До 4.000₽" && user.processType === "catalog") {
    await collectionUser.updateOne(
      { userId },
      { $set: { isInProcess: true, processType: "catalog_price=4000" } }
    );

    bot.sendMessage(chatId, "Вы выбрали диапазон: До 4.000₽", {
      reply_markup: {
        keyboard: [["Назад"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
    sendSlide(chatId, 0);
  }
  if (text === "4.0000₽-8.000₽" && user.processType === "catalog") {
    await collectionUser.updateOne(
      { userId },
      { $set: { isInProcess: true, processType: "catalog_price=8000" } }
    );
    bot.sendMessage(chatId, "Вы выбрали диапазон: 4.0000₽-8.000₽", {
      reply_markup: {
        keyboard: [["Назад"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }
  if (text === "8.000₽-15.000₽" && user.processType === "catalog") {
    await collectionUser.updateOne(
      { userId },
      { $set: { isInProcess: true, processType: "catalog_price=15000" } }
    );
    bot.sendMessage(chatId, "Вы выбрали диапазон: 8.000₽-15.000₽", {
      reply_markup: {
        keyboard: [["Назад"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }
});

// Обработка кнопки выбора даты

// Функция для создания календаря

bot.on("callback_query", async (query) => {
  if (!collectionUser) {
    return;
  }
  const user = await collectionUser.findOne({ userId: query.from.id });
  if (user.processType === "catalog_price=4000") {
    const chatId = query.message.chat.id;
    console.log(chatId);

    // Получаем текущий индекс из callback_data
    const data = query.data.split("_");
    const action = data[0];
    console.log(query.data, "data");

    const slideIndex = parseInt(data[1]);
    console.log(slideIndex, action);

    if (action === "prev" && slideIndex > -1) {
      // Переход на предыдущий слайд
      bot.deleteMessage(chatId, query.message.message_id); // Удаляем старый слайд
      sendSlide(chatId, slideIndex - 1);
    } else if (action === "next" && slideIndex < slides.length - 1) {
      // Переход на следующий слайд
      bot.deleteMessage(chatId, query.message.message_id); // Удаляем старый слайд
      sendSlide(chatId, slideIndex + 1);
    } else if (action === "disable") {
      bot.answerCallbackQuery(query.id, {
        text: "Нет доступных действий.",
        show_alert: false,
      });
    }
  } else if (
    query.message.message_id == calendar.chats.get(query.message.chat.id)
  ) {
    var res;
    res = calendar.clickButtonCalendar(query);
    if (res !== -1) {
      await collectionUser.updateOne(
        { userId: query.from.id },
        { $set: { selectedDate: res, processType: "prepare_address" } }
      );

      // Отправляем запрос на ввод адреса
      await bot.sendMessage(
        query.message.chat.id,
        `Вы выбрали дату: *${res}*. Теперь укажите адрес доставки. Вы можете ввести его следующим образом:\n\n` +
          `1️⃣ *Через локацию:* Нажмите кнопку "Отправить локацию" для отправки своего местоположения.\n` +
          `(Для отправки локации необходимо, чтобы у вас был телефон и включено разрешение на доступ к местоположению в Telegram.)\n\n` +
          `2️⃣ *Через текст:* Введите ваш адрес в формате: *Город, Улица, Дом* (например: Москва, Тверская улица, 7). \n` +
          `На данный момент мы работаем только в Москве.\n\n` +
          `3️⃣ *Самовывоз*: Вы можете забрать товар самостоятельно с нашего магазина по адресу Москва, Тверская улица, 7.\n` +
          `Для выбора этой опции нажмите "Самовывоз", и вы сможете выбрать удобное время для самовывоза.\n\n` +
          `ℹ️ *Обратите внимание:* Мы осуществляем доставку и самовывоз только в Москве.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [
              [{ text: "Отправить локацию" }],
              ["Ввести адрес", "Самовывоз"],
              ["Назад"],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
    }
  }
});
const slides = [
  {
    photo:
      "https://cdn.myshoptet.com/usr/www.teto.cz/user/shop/big/12294_number-1.jpg?5fe1b011",
    caption: "Описание для фото 1",
  },
  {
    photo: "https://cdn-icons-png.flaticon.com/512/6422/6422821.png",
    caption: "Описание для фото 2",
  },
  {
    photo: "https://roflmagnets.com/306-medium_default/number-3.jpg",
    caption: "Описание для фото 3",
  },
];
function sendSlide(chatId, slideIndex) {
  const slide = slides[slideIndex];

  // Inline-кнопки для навигации

  // Деактивация кнопки "Назад" на первом слайде
  const keyboard = {
    inline_keyboard: [
      [{ text: "Купить", callback_data: `buy_${slideIndex}` }],
      [
        { text: "⬅️ Назад", callback_data: `prev_${slideIndex}` },
        { text: "Вперёд ➡️", callback_data: `next_${slideIndex}` },
      ],
    ],
  };
  if (slideIndex == 0) {
  }
  // Изменение кнопок в зависимости от текущего слайда
  if (slideIndex === 0) {
    keyboard.inline_keyboard[0][0] = {
      text: "Купить",
      callback_data: `buy_${slideIndex}`,
    };
    keyboard.inline_keyboard[1][0] = {
      text: "⬅️ Назад",
      callback_data: `disable`,
    };
  }
  if (slideIndex === slides.length - 2) {
    keyboard.inline_keyboard[1][0] = {
      text: "⬅️ Назад",
      callback_data: `prev_${slideIndex}`,
    };
  }
  if (slideIndex === slides.length - 1) {
    keyboard.inline_keyboard[1][1] = {
      text: "Вперёд ➡️",
      callback_data: "disable",
    };
  }
  // Отправляем сообщение с кнопками
  bot.sendPhoto(chatId, slide.photo, {
    caption: slide.caption,
    reply_markup: keyboard,
  });
}
app.listen(3000, () => {
  console.log(`Сервер запущен на http://localhost:${3000}`);
});
