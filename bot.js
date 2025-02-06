import TelegramBot from "node-telegram-bot-api";
import { generateCalendar, getMonthName } from "./calendar.js";
import { MongoClient } from "mongodb";
import Robokaska from "robokassa";
import { Calendar } from "telegram-inline-calendar";

import cors from "cors";
import express from "express";

import crypto from "crypto";
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
const config = {
  shopIdentifier: "Florimnodi",
  password1: "dtBD5xF7xi2tN2B7QqAO",
  password2: "pE4fu3bO2qglZCa3dI5T",
  testMode: true, // Указываем true, если работаем в тестовом режиме
};

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

// Вспомогательная функция для вычисления контрольной суммы (SignatureValue)
function calculateSignature(OutSum, InvId, password2, additionalParams = "") {
  const baseString = `${OutSum}:${InvId}:${password2}`;
  const hash = md5(baseString);
  return hash;
}

// Функция для обработки уведомления от Robokassa на ResultURL

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

async function processPaymentNotification(req, res) {
  // Получаем параметры из запроса Robokassa
  const {
    OutSum,
    InvId,
    Fee,
    EMail,
    SignatureValue,
    PaymentMethod,
    IncCurrLabel,
    IsTest,
    ...additionalParams
  } = req.body;
  console.log(req.body);

  // Пароль 2, который вы используете для расчета хэша (обязательно замените на свой пароль)
  const password2 = "YuC5Vo27fxpNEnHV86cS";
  if (!collectionUser) {
    return;
  }
  console.log("", InvId, collectionUser);
  const invIdNumber = Number(InvId);
  const user = await collectionUser.findOne({ invId: invIdNumber });
  console.log(user, "", InvId);
  // Генерация строки для вычисления контрольной суммы
  let additionalParamsString = "";
  if (Object.keys(additionalParams).length > 0) {
    additionalParamsString = Object.entries(additionalParams)
      .map(([key, value]) => `${key}=${value}`)
      .join(":");
  }

  // Рассчитываем хэш
  const calculatedHash = await calculateSignature(
    OutSum,
    InvId,
    password2,
    additionalParamsString
  );
  console.log(calculatedHash, SignatureValue);

  // Проверка, совпадает ли контрольная сумма
  if (calculatedHash.toUpperCase() === SignatureValue.toUpperCase()) {
    // Проверка тестового режима
    if (IsTest === "1") {
      console.log(
        `Тестовый режим! Оплата успешна. InvId: ${InvId}, Сумма: ${OutSum}, Email: ${EMail}`
      );
    } else {
      console.log(
        `Оплата успешно прошла! InvId: ${InvId}, Сумма: ${OutSum}, Email: ${EMail}`
      );
    }

    // Отправляем ответ Robokassa для подтверждения получения уведомления
    res.status(200).send(`OK${InvId}`);
    bot.sendMessage(
      user.userId,
      `Оплата успешно прошла! InvId: ${InvId}, Сумма: ${OutSum}, Email: ${EMail}`
    );
  } else {
    // Контрольные суммы не совпали — ошибка
    console.error(`Ошибка верификации для InvId: ${InvId}`);

    // Отправляем ошибку или просто ничего не отправляем
    res.status(400).send("Error");
  }
}
app.post("/payment-success", processPaymentNotification);

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
function md5(string) {
  return crypto.createHash("md5").update(string).digest("hex").toUpperCase();
}

function generatePaymentLink(
  merchantLogin,
  password1,
  invId,
  outSum,
  description
) {
  // Расчёт контрольной суммы (SignatureValue)
  const signatureValue = md5(
    `${merchantLogin}:${outSum}:${invId}:${password1}`
  );

  // Формируем ссылку на оплату с параметрами
  const paymentLink = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${outSum}&InvoiceID=${invId}&SignatureValue=${signatureValue}&isTest=0`;

  // Возвращаем ссылку
  return paymentLink;
}
bot.onText(/\/test/, (msg) => {
  const chatId = msg.chat.id;
  try {
    // Пример значений
    const merchantLogin = "Florimnodi";
    const password1 = "dtBD5xF7xi2tN2B7QqAO";
    const invId = 0;
    const description = "ТехническаядокументацияпоROBOKASSA";
    const outSum = "8.96";

    const paymentUrl = generatePaymentLink(
      merchantLogin,
      password1,
      invId,
      outSum
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
  console.log(chatId, "chatId");

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

  await bot.sendMessage(chatId, message, {
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
      await bot.sendMessage(chatId, message, {
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
      await bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [["Перейти к оплате"], ["Назад"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return;
    }
    if (user && user.processType && user.processType === "prepare_payment") {
      const message = await cancelProcess(userId, collectionUser);
      await bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [["Перейти к оплате"], ["Назад"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return;
    }
    if (
      user &&
      user.processType &&
      user.processType === "extra_information" &&
      user.address === "Самовывоз"
    ) {
      console.log("exit");

      const message = await cancelProcess(userId, collectionUser);
      await bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [["9-11", "12-14"], ["15-17", "18-20", "20-21"], ["Назад"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return;
    }

    if (user && user.processType && user.processType === "extra_information") {
      const message = await cancelProcess(userId, collectionUser);
      await bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [["Назад"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return;
    }
    if (
      user &&
      user.processType &&
      user.processType === "recipient_number" &&
      user.address !== "Самовывоз"
    ) {
      const message = await cancelProcess(userId, collectionUser);
      await bot.sendMessage(chatId, message, {
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
      await bot.sendMessage(chatId, message, {
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
      await bot.sendMessage(chatId, message, {
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
  await bot.sendMessage(chatId, message);
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
      await bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [["Назад"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    } else {
      await bot.sendMessage(chatId, message, {
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
    await bot.sendMessage(chatId, message);
  }
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
      user.processType !== "prepare_payment")
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
        {
          $set: {
            selectedProduct,
            processType: "select_date",
            price: selectedProduct.price,
            photo: selectedProduct.photo,
          },
        }
      );

      const chatId = msg.chat.id;
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      const calendar = generateCalendar(year, month);

      bot.sendMessage(
        chatId,
        "Пожалуйста, выберите удобную вам дату:          ",
        {
          reply_markup: {
            inline_keyboard: calendar,
          },
        }
      );
    } else if (user.processType === "prepare_address") {
      // Сохранение адреса
      if (text === "Самовывоз") {
        await bot.sendMessage(
          chatId,
          "🕒 *Укажите примерное время, когда вы заберёте товар.*\n\n" +
            `Выберите удобное время ниже.`,
          {
            parse_mode: "Markdown",
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
          { userId },
          { $set: { address: "Самовывоз", processType: "select_time" } }
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
        await bot.sendMessage(
          chatId,
          "📍 **Пожалуйста, отправьте свою локацию.**\n\nЭто поможет нам быстрее найти ваш адрес и оформить доставку. 🗺️",
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
        await bot.sendMessage(
          chatId,
          "📍 **Адрес найден!**\n\nТеперь, пожалуйста, укажите удобное время доставки. ⏰",
          {
            parse_mode: "Markdown",
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
          { userId },
          { $set: { address: text, processType: "select_time" } }
        );
      } else {
        await bot.sendMessage(
          chatId,
          "❌ **Адрес не найден.**\n\nПожалуйста, попробуйте изменить адрес ",
          {
            parse_mode: "Markdown",
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
      if (user.address === "Самовывоз") {
        await bot.sendMessage(
          chatId,
          "⏰ **Время доставки выбрано.**\n\nТеперь, вы можете указать дополнительную информацию о заказе или нажать кнопку ниже, чтобы перейти к оплате. 💳",
          {
            parse_mode: "Markdown",
            reply_markup: {
              keyboard: [["Перейти к оплате"], ["Назад"]],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
        await collectionUser.updateOne(
          { userId },
          { $set: { time: text, processType: "extra_information" } }
        );
        return;
      }

      await bot.sendMessage(
        chatId,
        "⏰ **Время доставки выбрано.**\n\nТеперь, пожалуйста, укажите номер телефона получателя. 📞",
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [["Назад"]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );

      await collectionUser.updateOne(
        { userId },
        {
          $set: {
            time: text,
            processType: "recipient_number",
          },
        }
      );
    } else if (user.processType === "recipient_number" && text !== "Назад") {
      const phoneRegex =
        /^(\+7|8)\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}$/;
      if (!phoneRegex.test(text)) {
        await bot.sendMessage(
          chatId,
          "❌ **Неверный формат номера телефона.**\n\nПожалуйста, проверьте введенные данные и попробуйте еще раз. 📞",
          {
            parse_mode: "Markdown",
            reply_markup: {
              keyboard: [["Назад"]],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
        return;
      }
      console.log("EXTRA INFORMATION");

      await bot.sendMessage(
        chatId,
        "📱 Номер телефона получателя успешно выбран. \n\nТеперь, при желании, вы можете указать дополнительную информацию о заказе или нажать кнопку ниже, чтобы перейти к оплате. 💳",
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [["Перейти к оплате"], ["Назад"]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
      await collectionUser.updateOne(
        { userId },
        { $set: { recipientNumber: text, processType: "extra_information" } }
      );
    } else if (
      user.processType === "extra_information" &&
      text !== "Назад" &&
      text !== "Перейти к оплате"
    ) {
      await bot.sendMessage(
        chatId,
        "✨ Дополнительная информация о заказе успешно сохранена. Перейдите к оплате. ✨",
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [[" Перейти к оплате"], [" Назад"]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
      await collectionUser.updateOne(
        { userId },
        { $set: { extraInformation: text, processType: "prepare_payment" } }
      );
    } else if (
      user.processType === "extra_information" &&
      text === "Перейти к оплате" &&
      text !== "Назад"
    ) {
      const merchantLogin = "Florimnodi";
      const password1 = "dtBD5xF7xi2tN2B7QqAO";
      const invId = Math.floor(100000 + Math.random() * 900000);

      const outSum = await user.price;

      const paymentUrl = await generatePaymentLink(
        merchantLogin,
        password1,
        invId,
        outSum
      );

      await collectionUser.updateOne(
        { userId },
        { $set: { invId, processType: "payment" } }
      );
      // Отправка ссылки пользователю
      await bot.sendMessage(
        chatId,
        `💳 *Оплата заказа* 💳\n\n` +
          `🔗 [Нажмите сюда, чтобы оплатить](${paymentUrl})\n\n` +
          `✅ После успешной оплаты ваш заказ будет обработан автоматически.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [["Назад"]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
    } else if (user.processType === "prepare_payment" && text !== "Назад") {
      const merchantLogin = "Florimnodi";
      const password1 = "dtBD5xF7xi2tN2B7QqAO";
      const invId = Math.floor(100000 + Math.random() * 900000);

      const outSum = await user.price;

      const paymentUrl = await generatePaymentLink(
        merchantLogin,
        password1,
        invId,
        outSum
      );

      // Отправка ссылки пользователю
      await bot.sendMessage(
        chatId,
        `💳 *Оплата заказа* 💳\n\n` +
          `🔗 [Нажмите сюда, чтобы оплатить](${paymentUrl})\n\n` +
          `✅ После успешной оплаты ваш заказ будет обработан автоматически.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [["Назад"]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
      await collectionUser.updateOne(
        { userId },
        { $set: { invId, processType: "payment" } }
      );
      return;
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
    await bot.sendMessage(chatId, text, {
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

    await bot.sendMessage(chatId, "www.florimondi.ru/about/", {
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
    await bot.sendMessage(chatId, "Выберете диапазон цен ", {
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

    await bot.sendMessage(chatId, "Вы выбрали диапазон: До 4.000₽", {
      reply_markup: {
        keyboard: [["Назад"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
    await sendSlide(chatId, 0);
  }
  if (text === "4.0000₽-8.000₽" && user.processType === "catalog") {
    await collectionUser.updateOne(
      { userId },
      { $set: { isInProcess: true, processType: "catalog_price=8000" } }
    );
    await bot.sendMessage(chatId, "Вы выбрали диапазон: 4.0000₽-8.000₽", {
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
    await bot.sendMessage(chatId, "Вы выбрали диапазон: 8.000₽-15.000₽", {
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
  const chatId = query.message.chat.id;
  const callback_data = query.data;
  const user = await collectionUser.findOne({ userId: query.from.id });
  if (user.processType === "catalog_price=4000") {
    console.log(chatId);

    // Получаем текущий индекс из callback_data
    const data = query.data.split("_");
    const action = data[0];
    console.log(query.data, "data");

    const slideIndex = parseInt(data[1]);
    console.log(slideIndex, action);

    if (action === "prev" && slideIndex > -1) {
      // Переход на предыдущий слайд
      await bot.deleteMessage(chatId, query.message.message_id); // Удаляем старый слайд
      await sendSlide(chatId, slideIndex - 1);
    } else if (action === "next" && slideIndex < slides.length - 1) {
      // Переход на следующий слайд
      await bot.deleteMessage(chatId, query.message.message_id); // Удаляем старый слайд
      await sendSlide(chatId, slideIndex + 1);
    } else if (action === "disable") {
      await bot.answerCallbackQuery(query.id, {
        text: "Нет доступных действий.",
        show_alert: false,
      });
    }
  } else if (
    callback_data.startsWith("date_") ||
    callback_data.startsWith("prev_") ||
    callback_data.startsWith("next_") ||
    callback_data === "ignore"
  ) {
    // const chatId = query.message.chat.id;
    // const data = callbackQuery.data;

    if (callback_data.startsWith("date_")) {
      const date = callback_data.split("_")[1];
      await bot.sendMessage(
        chatId,
        `Вы выбрали дату: *${date}*. Теперь укажите адрес доставки. Вы можете ввести его следующим образом:\n\n` +
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

      bot.deleteMessage(chatId, query.message.message_id);
      await collectionUser.updateOne(
        { userId: chatId },
        { $set: { selectedDate: date, processType: "prepare_address" } }
      );
    } else if (
      callback_data.startsWith("prev_") ||
      callback_data.startsWith("next_")
    ) {
      const [action, year, month] = callback_data.split("_");
      let newYear = parseInt(year);
      let newMonth = parseInt(month);

      if (action === "prev") {
        newMonth -= 1;
        if (newMonth < 0) {
          newMonth = 11;
          newYear -= 1;
        }
      } else if (action === "next") {
        newMonth += 1;
        if (newMonth > 11) {
          newMonth = 0;
          newYear += 1;
        }
      }

      const calendar = generateCalendar(newYear, newMonth);

      await bot.editMessageReplyMarkup(
        { inline_keyboard: calendar },
        {
          chat_id: chatId,
          message_id: query.message.message_id,
        }
      );
    } else if (callback_data === "ignore") {
      bot.answerCallbackQuery(query.id, {
        text: "Эта дата недоступна для выбора.",
      });
    }

    // Отправляем запрос на ввод адреса
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
