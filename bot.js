import TelegramBot from "node-telegram-bot-api";
import { generateCalendar, getMonthName } from "./calendar.js";
import { MongoClient } from "mongodb";
import Robokaska from "robokassa";
import { Calendar } from "telegram-inline-calendar";
import { getAvailableShippingTime } from "./avaliableShippingTime.js";
import cors from "cors";
import { Readable } from "stream";

import dotenv from "dotenv";
dotenv.config();
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
import axios from "axios";

// Вставьте токен вашего бота
const BOT_TOKEN = process.env.BOT_TOKEN;
const app = express();

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
  try {
    if (!req.body) {
      return res.status(400).json({ message: "Bad request" });
    }
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
    const password2 = "Sy6uRaE5b5Fh0NWlbXE8";
    if (!collectionUser) {
      return;
    }

    const invIdNumber = Number(InvId);
    const user = await collectionUser.findOne({ invId: invIdNumber });

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
    if (!calculatedHash) {
      return res.status(400).json({ message: "Bad request" });
    }
    if (!SignatureValue) {
      return res.status(400).json({ message: "Bad request" });
    }
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
      await res.status(200).send(`OK${InvId}`);

      const response = await axios.get(
        `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${user.photo}`
      );

      const filePath = await response.data.result.file_path;

      // Скачиваем фото
      const photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
      console.log(photoUrl);
      await bot.sendMessage(
        -1002291227368,
        `✅ *Оплата успешно прошла!*\n\n` +
          `💰 *Цена:* ${user.price}\n` +
          `📧 *Email:* ${EMail}\n` +
          `📷 *Ссылка на фото:* [Открыть фото](${photoUrl})\n` +
          `📞 *Номер телефона получателя:* ${
            user.recipientNumber ? user.recipientNumber : "Не указан номер"
          }\n` +
          `📞 *Номер телефона заказчика:* ${
            user.clientNumber ? user.clientNumber : "Не указан номер"
          }\n` +
          `📍 *Адрес доставки:* ${
            user.address ? user.address : "Не указан адрес"
          }\n` +
          `📅 *Дата доставки:* ${
            user.selectedDate ? user.selectedDate : "Не указана дата"
          }\n` +
          `⏰ *Время доставки/Удобное время для самовывоза:* ${
            user.time ? user.time : "Не указано время"
          }\n` +
          `📝 *Дополнительная информация:* ${
            user.extraInformation ? user.extraInformation : "Не указано"
          }\n\n`,
        {
          parse_mode: "Markdown",
        }
      );
      await bot.sendMessage(
        user.userId,
        `✅ *Оплата успешно прошла!*\n\n` +
          `💰 *Цена:* ${user.price}\n` +
          `📧 *Email:* ${EMail}\n` +
          `📷 *Ссылка на фото:* [Открыть фото](${photoUrl})\n` +
          `📞 *Номер телефона получателя:* ${
            user.recipientNumber ? user.recipientNumber : "Не указан номер"
          }\n` +
          `📞 *Номер телефона заказчика:* ${
            user.clientNumber ? user.clientNumber : "Не указан номер"
          }\n` +
          `📍 *Адрес доставки:* ${
            user.address ? user.address : "Не указан адрес"
          }\n` +
          `📅 *Дата доставки:* ${
            user.selectedDate ? user.selectedDate : "Не указана дата"
          }\n` +
          `⏰ *Время доставки/Удобное время для самовывоза:* ${
            user.time ? user.time : "Не указано время"
          }\n` +
          `📝 *Дополнительная информация:* ${
            user.extraInformation ? user.extraInformation : "Не указано"
          }\n\n`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [["Вернуться в главное меню"]],
            resize_keyboard: true, // Делает кнопки компактными
            one_time_keyboard: true, // Убирает клавиатуру после нажатия
          },
        }
      );
      await collectionUser.updateOne(
        { userId: user.userId },
        { $set: { processType: "finished" } }
      );
    } else {
      // Контрольные суммы не совпали — ошибка
      console.error(`Ошибка верификации для InvId: ${InvId}`);

      // Отправляем ошибку или просто ничего не отправляем
      res.status(400).send("Error");
    }
  } catch (e) {
    console.log(e);
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

// Включаем тестовый режим, если нужно
function generatePaymentLink(
  merchantLogin,
  password1,
  invId,
  outSum,
  description,
  items,
  isTest = false
) {
  // Формируем JSON-объект с фискальным чеком (54-ФЗ)
  const receipt = {
    sno: "usn_income", // Система налогообложения (например, "usn_income" - УСН Доход)
    items: [
      {
        name: "Название цветка", // Название товара
        quantity: 1, // Количество
        sum: 10, // Сумма
        payment_method: "full_prepayment", // Полная предоплата
        payment_object: "commodity", // Товар (можно "service" для услуг)
        tax: "none", // Тип налога ("none", "vat0", "vat10", "vat20" и т. д.)
      },
    ],
  };

  // Преобразуем чек в строку и кодируем в base64
  const encodedReceipt = Buffer.from(JSON.stringify(receipt)).toString(
    "base64"
  );

  // Формируем строку для подписи (SignatureValue)
  const signatureString = `${merchantLogin}:${outSum}:${invId}:${encodedReceipt}:${password1}`;
  const signatureValue = crypto
    .createHash("md5")
    .update(signatureString)
    .digest("hex");

  // Формируем URL для оплаты
  let paymentLink = `
    https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${outSum}&InvoiceID=${invId}&Description=${encodeURIComponent(
    description
  )}&SignatureValue=${signatureValue}&Description=${"Красивые цветы"}&Receipt=${encodeURIComponent(
    encodedReceipt
  )}&Encoding=utf-8&Culture=ru`;

  // Включаем тестовый режим, если нужно

  return paymentLink;
}
// Пример использования:

// Товары в заказе

bot.onText(/\/location/, async (msg) => {
  const chatId = msg.chat.id;

  // Отправляем кнопку для отправки местоположения
  await bot.sendMessage(chatId, "Пожалуйста, отправьте свое местоположение", {
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
    const availableTimes = await getAvailableShippingTime(user);
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
            keyboard: [...availableTimes, ["Назад"]],
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
// import { getDistance } from "geolib";
// bot.onText(/\/noob/, async (msg) => {
//   async function getCoordinates(address) {
//     const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
//       address
//     )}&format=json&limit=1`;
//     const response = await axios.get(url);

//     if (response.data.length === 0) {
//       throw new Error(`Не удалось найти координаты для адреса: ${address}`);
//     }

//     const { lat, lon } = response.data[0];
//     return { latitude: parseFloat(lat), longitude: parseFloat(lon) };
//   }

//   async function calculateDistance(address1, address2) {
//     try {
//       const coord1 = await getCoordinates(address1);
//       const coord2 = await getCoordinates(address2);

//       const distanceMeters = getDistance(coord1, coord2);
//       const distanceKm = distanceMeters / 1000;

//       console.log(`Расстояние: ${distanceKm.toFixed(2)} км`);
//       return distanceKm;
//     } catch (error) {
//       console.error("Ошибка:", error.message);
//     }
//   }

//   // Пример использования
//   calculateDistance(" руновский переулок 8с1", " подольских курсантов 10");
// });
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(chatId, "chatId");
  const chatType = msg.chat.type; // 'private', 'group', 'supergroup'
  if (chatType === "supergroup") {
    return; // Игнорируем команды в группе
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
  bot.setMyCommands([
    {
      command: "/menu",
      description: "Возвращает вас в главное меню",
    },
  ]);

  await bot.sendMessage(
    chatId,
    "*Добро пожаловать!*\n\n" +
      "Это ваш помощник.\n\n" +
      "- Мы предлагаем:\n" +
      "  1. Отличное качество\n" +
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
  const chatType = msg.chat.type; // 'private', 'group', 'supergroup'
  if (chatType === "supergroup") {
    return; // Игнорируем команды в группе
  }
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
  const chatType = msg.chat.type; // 'private', 'group', 'supergroup'
  if (chatType === "supergroup") {
    return; // Игнорируем команды в группе
  }
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
  const chatType = msg.chat.type; // 'private', 'group', 'supergroup'
  if (chatType === "supergroup") {
    return; // Игнорируем команды в группе
  }
  const user = await collectionUser.findOne({ userId });
  if (text === "Вернуться в главное меню" && user.processType === "finished") {
    await collectionUser.updateOne(
      { userId },
      { $set: { isInProcess: false, processType: null } }
    );
    await bot.sendMessage(chatId, "Вы вернулись в главное меню.", {
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
    await collectionUser.updateOne(
      { userId },
      { $set: { isInProcess: false, processType: null } }
    );
    return;
  }
  if (text === "Назад" && user.processType !== "finished") {
    if (
      (user && user.processType === "catalog_price=4000") ||
      (user && user.processType === "catalog_price=8000") ||
      (user && user.processType === "catalog_price=10000") ||
      (user && user.processType === "catalog_price=10000++")
    ) {
      const message = await cancelProcess(userId, collectionUser);

      await collectionUser.updateOne(
        { userId },
        { $set: { message_to_delete: null } }
      );
      await bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [
            ["Монобукеты", "Корзины"],

            ["Раскидистые букеты", "Коробки"],
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
    if (user && user.processType && user.processType === "who_is_client") {
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
    if (user && user.processType && user.processType === "client_number") {
      const message = await cancelProcess(userId, collectionUser);
      const availableTimes = getAvailableShippingTime(user);
      await bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [...availableTimes, ["Назад"]],
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
      user.whoIsClient === "Другой человек"
    ) {
      const message = await cancelProcess(userId, collectionUser);
      await bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [["Я", "Другой человек"], ["Назад"]],
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
      user.processType === "extra_information" &&
      user.whoIsClient === "Я"
    ) {
      const message = await cancelProcess(userId, collectionUser);
      await bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [["Я", "Другой человек"], ["Назад"]],
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
      const availableTimes = getAvailableShippingTime(user);

      await bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [...availableTimes, ["Назад"]],
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
      (user.whoIsClient === "Другой человек" || user.whoIsClient === "Я")
    ) {
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
      (user && user.processType && user.processType === "send_location") ||
      (user && user.processType && user.processType === "enter_address") ||
      (user && user.processType && user.processType === "select_time")
    ) {
      const message = await cancelProcess(userId, collectionUser);
      await bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [["Ввести адрес", "Самовывоз"], ["Назад"]],
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
  const chatType = msg.chat.type; // 'private', 'group', 'supergroup'
  if (chatType === "supergroup") {
    return; // Игнорируем команды в группе
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
  const chatType = msg.chat.type; // 'private', 'group', 'supergroup'
  console.log(chatType);

  if (chatType === "supergroup") {
    return; // Игнорируем команды в группе
  }
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
      user.processType !== "client_number" &&
      user.processType !== "who_is_client" &&
      user.processType !== "prepare_payment")
  ) {
    console.log("User is in process");

    return; // Не обрабатываем, если пользователь в процессе
  }

  try {
    if (text === "Онлайн-витрина" && !user.isInProcess) {
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
        .slice(0, 10);

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
      await bot.sendMessage(chatId, "Букет выбран!", {
        reply_markup: {
          keyboard: [["Назад"]],
        },
      });
      await bot.sendMessage(
        chatId,
        "📅Пожалуйста, выберите удобную вам дату:          ",
        {
          reply_markup: {
            inline_keyboard: calendar,

            resize_keyboard: true,
          },
        }
      );
    } else if (user.processType === "prepare_address") {
      if (text === "Самовывоз") {
        const availableTimes = getAvailableShippingTime(user);
        console.log(availableTimes[0][0]);

        await bot.sendMessage(
          chatId,
          "🕒 *Укажите примерное время, когда вы заберёте товар.*\n\n" +
            `Выберите удобное время ниже.`,
          {
            parse_mode: "Markdown",
            reply_markup: {
              keyboard: [...availableTimes, ["Назад"]],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
        setTimeout(async () => {
          await collectionUser.updateOne(
            { userId },
            { $set: { address: "Самовывоз", processType: "select_time" } }
          );
        }, 700);
      } else if (text === "Ввести адрес") {
        await bot.sendMessage(
          chatId,
          "Укажите, какую доставку вы предпочитаете?",
          {
            reply_markup: {
              keyboard: [
                ["Доставка по Москве в пределах МКАД — 750 ₽"],
                ["Курьер за МКАД- Ближнее Подмосковье — 950 ₽"],
                ["Курьер за МКАД - область — 2000 ₽"],
              ],
            },
          }
        );
      }
      // Если пользователь выбрал путь через текстовый адрес
      else if (
        text === "Доставка по Москве в пределах МКАД — 750 ₽" ||
        text === "Курьер за МКАД- Ближнее Подмосковье — 950 ₽" ||
        text === "Курьер за МКАД - область — 2000 ₽"
      ) {
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
        await collectionUser.updateOne({ userId }, { $set: { MKAD: text } });
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
        const availableTimes = getAvailableShippingTime(user);

        await bot.sendMessage(
          chatId,
          "📍 **Адрес найден!**\n\nТеперь, пожалуйста, укажите удобное время доставки. ⏰",
          {
            parse_mode: "Markdown",
            reply_markup: {
              keyboard: [...availableTimes, ["Назад"]],
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
    } else if (
      (user.processType === "select_time" && text === "9-11") ||
      (user.processType === "select_time" && text === "12-14") ||
      (user.processType === "select_time" && text === "15-17") ||
      (user.processType === "select_time" && text === "18-20") ||
      (user.processType === "select_time" &&
        text === "20-21" &&
        user.processType === "select_time" &&
        text !== "Назад")
    ) {
      console.log(getAvailableShippingTime(user)[0][0], "zzzww");

      if (
        getAvailableShippingTime(user)[0][0] ===
        "К сожалению, на этот день доставка недоступна."
      ) {
        console.log("can nto");

        return;
      }
      if (user.address === "Самовывоз") {
        console.log(getAvailableShippingTime(user)[0][0], "zzw");

        await bot.sendMessage(
          chatId,
          "⏰ **Время доставки выбрано.**\n\nТеперь, пожалуйста, укажите ваш номер телефона. 📞",
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
          { $set: { time: text, processType: "client_number" } }
        );
        return;
      }

      await bot.sendMessage(
        chatId,
        "⏰ **Время доставки выбрано.**\n\nТеперь, пожалуйста, укажите ваш номер телефона. 📞",
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
            processType: "client_number",
          },
        }
      );
    } else if (user.processType === "client_number" && text !== "Назад") {
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
      if (user.address === "Самовывоз") {
        await bot.sendMessage(
          chatId,
          "📱Ваш номер телефона успешно сохранен. \n\nСейчас, при желании, вы можете указать дополнительную информацию о заказе или нажать кнопку ниже, чтобы перейти к оплате. 💳",
          {
            parse_mode: "Markdown",
            reply_markup: {
              keyboard: [["Перейти к оплате"], ["Назад"]],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
      } else {
        await bot.sendMessage(
          chatId,
          "📱Ваш номер телефона успешно сохранен. \n\nТеперь, укажите кто получит заказ \n1️⃣  Я\n2️⃣ Другой человек\n\n📱 Пожалуйста, выберите один из вариантов. ",
          {
            parse_mode: "Markdown",
            reply_markup: {
              keyboard: [["Я", "Другой человек"], ["Назад"]],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
      }
      await collectionUser.updateOne(
        { userId },
        {
          $set: {
            clientNumber: text,
            processType:
              user.address === "Самовывоз"
                ? "extra_information"
                : "who_is_client",
          },
        }
      );
    } else if (
      user.processType === "who_is_client" &&
      text !== "Назад" &&
      user.address !== "Самовывоз"
    ) {
      if (text === "Я") {
        await bot.sendMessage(
          chatId,
          "📱Вы указали себя как получателя. \n\nСейчас, при желании вы можете указать дополнительную информацию или перейти к оплате. 📞",
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
          {
            $set: {
              whoIsClient: text,
              processType: "extra_information",
            },
          }
        );
      } else if (text === "Другой человек") {
        await bot.sendMessage(
          chatId,
          "📱Вы указали другого человека как получателя. \n\nУкажите номер телефона этого человека 📞",
          {
            parse_mode: "Markdown",
            reply_markup: {
              keyboard: [[""], ["Назад"]],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
        await collectionUser.updateOne(
          { userId },
          {
            $set: {
              whoIsClient: text,
              processType: "recipient_number",
            },
          }
        );
      }
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
        "📱 Номер телефона получателя успешно выбран. \n\nСейчас, при желании, вы можете указать дополнительную информацию о заказе или нажать кнопку ниже, чтобы перейти к оплате. 💳",
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
      const password1 = "Gux2OMl1lsq4HxGc12cQ";
      const invId = Math.floor(100000 + Math.random() * 900000);

      const extraPrice =
        user &&
        (await user.MKAD) === "Доставка по Москве в пределах МКАД — 750 ₽"
          ? 1
          : user.MKAD === "Курьер за МКАД- Ближнее Подмосковье — 950 ₽"
          ? 2
          : user.MKAD === "Курьер за МКАД - область — 2000 ₽"
          ? 3
          : 0;
      const outSum = (await user.price) + extraPrice;

      const link = await generatePaymentLink(
        merchantLogin,
        password1,
        invId,
        outSum
      );

      console.log(link);

      await collectionUser.updateOne(
        { userId },
        { $set: { invId, processType: "payment" } }
      );
      // Отправка ссылки пользователю
      await bot.sendMessage(
        chatId,
        `💳 *Оплата заказа* 💳\n\n` +
          `📦 Цена товара: *${await user.price}₽*\n` +
          `🚚 Цена доставки: *${extraPrice}₽*\n` +
          `💰Финальная цена с учетом доставки: *${outSum}₽*\n\n` +
          `🔗 ${link}\n\n` +
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
    } else if (
      user.processType === "prepare_payment" &&
      text === "Перейти к оплате" &&
      text !== "Назад"
    ) {
      const merchantLogin = "Florimnodi";
      const password1 = "Gux2OMl1lsq4HxGc12cQ";
      const invId = Math.floor(100000 + Math.random() * 900000);

      const extraPrice =
        user &&
        (await user.MKAD) === "Доставка по Москве в пределах МКАД — 750 ₽"
          ? 1
          : user.MKAD === "Курьер за МКАД- Ближнее Подмосковье — 950 ₽"
          ? 2
          : user.MKAD === "Курьер за МКАД - область — 2000 ₽"
          ? 3
          : 0;
      const outSum = (await user.price) + extraPrice;

      const link = await generatePaymentLink(
        merchantLogin,
        password1,
        invId,
        outSum
      );

      console.log(link);

      // Отправка ссылки пользователю
      await bot.sendMessage(
        chatId,
        `💳 *Оплата заказа* 💳\n\n` +
          `📦 Цена товара: *${await user.price}₽*\n` +
          `🚚 Цена доставки: *${extraPrice}₽*\n` +
          `💰Финальная цена с учетом доставки: *${outSum}₽*\n` +
          `🔗${link}\n\n` +
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
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    if (!collectionUser) {
      return;
    }
    const chatType = msg.chat.type; // 'private', 'group', 'supergroup'
    if (chatType === "supergroup") {
      return; // Игнорируем команды в группе
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
      user.processType !== "catalog_price=15000" &&
      user.processType !== "map"
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

      await bot.sendMessage(chatId, "Выберете интересующий вас каталог ", {
        reply_markup: {
          keyboard: [
            ["Монобукеты", "Корзины"],

            ["Раскидистые букеты", "Коробки"],

            ["Назад"],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    } else if (text === "Мы на карте") {
      await collectionUser.updateOne(
        { userId },
        { $set: { isInProcess: true, processType: "map" } }
      );
      await bot.sendLocation(chatId, 55.743139, 37.633583);
      await bot.sendMessage(
        chatId,
        "Москва, Руновский переулок 8, строение 1",
        {
          reply_markup: {
            keyboard: [["Назад"]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
    }
    if (text === "Монобукеты" && user.processType === "catalog") {
      await collectionUser.updateOne(
        { userId },
        { $set: { isInProcess: true, processType: "catalog_price=4000" } }
      );

      await bot.sendMessage(chatId, "Вы выбрали каталог: Монобукеты", {
        reply_markup: {
          keyboard: [["Назад"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });

      // Отправка каталога
      async function sendCatalog() {
        for (const item of slidesFor4k) {
          await bot.sendPhoto(chatId, item.photo, {
            caption: item.caption,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[{ text: "🛒 Купить", url: item.url }]],
            },
          });
        }
      }

      await sendCatalog();
    }
    if (text === "Корзины" && user.processType === "catalog") {
      await collectionUser.updateOne(
        { userId },
        { $set: { isInProcess: true, processType: "catalog_price=8000" } }
      );
      await bot.sendMessage(chatId, "Вы выбрали каталог: Корзины", {
        reply_markup: {
          keyboard: [["Назад"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      async function sendCatalog() {
        for (const item of slidesFor7k) {
          await bot.sendPhoto(chatId, item.photo, {
            caption: item.caption,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[{ text: "🛒 Купить", url: item.url }]],
            },
          });
        }
      }

      await sendCatalog();
    }
    if (text === "Коробки" && user.processType === "catalog") {
      await collectionUser.updateOne(
        { userId },
        { $set: { isInProcess: true, processType: "catalog_price=10000" } }
      );
      await bot.sendMessage(chatId, "Вы выбрали каталог: Коробки", {
        reply_markup: {
          keyboard: [["Назад"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      async function sendCatalog() {
        for (const item of slidesFor10k) {
          await bot.sendPhoto(chatId, item.photo, {
            caption: item.caption,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[{ text: "🛒 Купить", url: item.url }]],
            },
          });
        }
      }
      await sendCatalog();
    } else if (
      text === "Раскидистые букеты" &&
      user.processType === "catalog"
    ) {
      await collectionUser.updateOne(
        { userId },
        { $set: { isInProcess: true, processType: "catalog_price=10000++" } }
      );
      await bot.sendMessage(chatId, "Вы выбрали каталог: Раскидистые букеты", {
        reply_markup: {
          keyboard: [["Назад"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      async function sendCatalog() {
        for (const item of slidesFor10moreK) {
          await bot.sendPhoto(chatId, item.photo, {
            caption: item.caption,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[{ text: "🛒 Купить", url: item.url }]],
            },
          });
        }
      }
      await sendCatalog();
    }
  } catch (error) {
    console.error("Ошибка при обработке текстового сообщения:", error);
  }
});

// Обработка кнопки выбора даты

// Функция для создания календаря

bot.on("callback_query", async (query) => {
  try {
    if (!collectionUser) {
      return;
    }
    const chatId = query.message.chat.id;
    const callback_data = query.data;
    console.log("callback_data", callback_data);

    const user = await collectionUser.findOne({ userId: query.from.id });
    if (user.processType === "catalog_price=10000++") {
      console.log(chatId);

      const data = query.data.split("_");
      const action = data[0];
      console.log(query.data, "data");

      const slideIndex = parseInt(data[1]);
      console.log(slideIndex, action);

      if (action === "prev" && slideIndex > 0) {
        await bot.deleteMessage(chatId, query.message.message_id);
        await sendSlide(chatId, slideIndex - 1, query.message.message_id);
      } else if (
        action === "next" &&
        slideIndex < slidesFor10moreK.length - 1
      ) {
        await bot.deleteMessage(chatId, query.message.message_id);
        await sendSlide(chatId, slideIndex + 1, query.message.message_id);
      } else if (action === "disable") {
        await bot.answerCallbackQuery(query.id, {
          text: "Нет доступных действий.",
          show_alert: false,
        });
      }
    }
    if (user.processType === "catalog_price=10000") {
      console.log(chatId);

      const data = query.data.split("_");
      const action = data[0];
      console.log(query.data, "data");

      const slideIndex = parseInt(data[1]);
      console.log(slideIndex, action);

      if (action === "prev" && slideIndex > 0) {
        await bot.deleteMessage(chatId, query.message.message_id);
        await sendSlide(chatId, slideIndex - 1, query.message.message_id);
      } else if (action === "next" && slideIndex < slidesFor10k.length - 1) {
        await bot.deleteMessage(chatId, query.message.message_id);
        await sendSlide(chatId, slideIndex + 1, query.message.message_id);
      } else if (action === "disable") {
        await bot.answerCallbackQuery(query.id, {
          text: "Нет доступных действий.",
          show_alert: false,
        });
      }
    }
    if (
      user.processType === "catalog_price=4000" ||
      user.processType === "catalog_price=8000"
    ) {
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
        await sendSlide(chatId, slideIndex - 1, query.message.message_id);
      } else if (action === "next" && slideIndex < slidesFor4k.length - 1) {
        // Переход на следующий слайд
        await bot.deleteMessage(chatId, query.message.message_id); // Удаляем старый слайд
        await sendSlide(chatId, slideIndex + 1, query.message.message_id);
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
        const rawDate = callback_data.split("_")[1]; // "2025-02-06"

        // Разбиваем на год, месяц, день
        const [year, month, day] = rawDate.split("-");

        // Форматируем в DD.MM.YYYY
        const formattedDate = `${day}.${month}.${year}`;

        await bot.sendMessage(
          chatId,
          `Вы выбрали дату: *${formattedDate}*. Теперь укажите адрес доставки. Вы можете ввести его следующим образом:\n\n` +
            `1️⃣ *Ввести адрес:* Введите ваш адрес в формате: *Город, Улица, Дом* (например: Москва, Тверская улица, 7). \n` +
            `На данный момент мы работаем только в Москве.\n\n` +
            `2️⃣ *Самовывоз*: Вы можете забрать товар самостоятельно с нашего магазина по адресу Москва, Руновский переулок 8, строение 1.\n` +
            `Для выбора этой опции нажмите "Самовывоз", и вы сможете выбрать удобное время для самовывоза.\n\n` +
            `ℹ️ *Обратите внимание:* Мы осуществляем доставку и самовывоз только в Москве.`,
          {
            parse_mode: "Markdown",
            reply_markup: {
              keyboard: [["Ввести адрес", "Самовывоз"], ["Назад"]],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );

        bot.deleteMessage(chatId, query.message.message_id);
        await collectionUser.updateOne(
          { userId: chatId },
          {
            $set: {
              selectedDate: formattedDate,
              processType: "prepare_address",
            },
          }
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
          {
            inline_keyboard: calendar,
          },

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
  } catch (e) {
    console.log(e);
  }
});
const slidesFor4k = [
  {
    photo:
      "https://florimondi.ru/upload/resize_cache/webp/iblock/db3/nmugxa8378en403el40i4mi7p3hy1lcf.webp",
    caption:
      "✨ Яркий букет на день рождения из 9 кустовых пионовидных роз.\n💰 Цена:3 590 ₽",
    url: "https://florimondi.ru/catalog/monobukety/yarkiy-buket-iz-9-kustovykh-pionovidnykh-roz/",
  },
  {
    photo:
      "https://florimondi.ru/upload/resize_cache/webp/iblock/187/cct4r30fwjhc1x7xryip9vrbehirkjfj.webp",
    caption:
      "🌸 Монобукет из кустовой пионовидной розы и веточек эвкалипта.\n💰 Цена: 3 990 ₽",
    url: "https://florimondi.ru/catalog/monobukety/monobuket-iz-kustovoy-pionovidnoy-rozy-i-vetochek-evkalipta/",
  },
  {
    photo:
      "https://florimondi.ru/upload/resize_cache/webp/iblock/0df/xzwnwq81t5w3n66id34ldlboguoqc3s1.webp",
    caption:
      "💜 Букет на день рождения из 17 кружевных диантусов с эвкалиптом.\n💰 Цена: 4 590 ₽",
    url: "https://florimondi.ru/catalog/monobukety/buket-iz-17-kruzhevnykh-diantusov-s-evkaliptom/",
  },
  {
    photo:
      "https://florimondi.ru/upload/resize_cache/webp/iblock/4bf/u4p200na4f5frr9dm7iru00ffwyfb5nk.webp",
    caption:
      "🌷 Большой букет из 35 кустовых пионовидных роз Мисти Баблз.\n💰 Цена: 9 990 ₽",
    url: "https://florimondi.ru/catalog/monobukety/buket-iz-35-kustovykh-pionovidnykh-roz-misti-bablz/",
  },
];

const slidesFor7k = [
  {
    photo:
      "https://florimondi.ru/upload/resize_cache/webp/iblock/45e/hxdwi73xqzpqay03h9a0kfrs2wxyi0d9.webp",
    caption:
      "💖 Корзина на день рождения «Пинк» с французскими розами и клематисом.\n💰 Цена: 9 990 ₽",
    url: "https://florimondi.ru/catalog/korziny-tsvetov/korzina-pink-s-frantsuzskimi-rozami-i-klematisom/",
  },
  {
    photo:
      "https://florimondi.ru/upload/iblock/149/ytt3g4qbus3u5vdqvr5gjorgkxzlq06d.jpg",
    caption: "🌿Корзина с фруктами «Смузи».\n💰 12 590 ₽",
    url: "https://florimondi.ru/catalog/korziny-tsvetov/korzina-s-fruktami-smuzi/",
  },
  {
    photo:
      "https://florimondi.ru/upload/resize_cache/webp/iblock/92e/2zqkdo6j1b3fvuyg2unvyu4gd0e547al.webp",
    caption: '🌷 Большая корзина с цветами "Райский сад".\n💰 Цена:12 990 ₽',
    url: "https://florimondi.ru/catalog/korziny-tsvetov/korzina-s-tsvetami-rayskiy-sad/",
  },
  {
    photo:
      "https://florimondi.ru/upload/resize_cache/webp/iblock/4e3/0bd85tx3ecfhlfobm48ksgn3y3m1xwuq.webp",
    caption: "🌸Большая корзина с цветами «Магия чувств».\n💰 Цена: 19 990 ₽",
    url: "https://florimondi.ru/catalog/korziny-tsvetov/korzina-s-tsvetami-magiya-chuvstv/",
  },
];

const slidesFor10k = [
  {
    photo:
      "https://florimondi.ru/upload/resize_cache/webp/iblock/976/0e7kl2ypajff6n6bbr00xwzvdy53jjtw.webp",
    caption: `🌺 Шляпная коробочка с садовой розой и маттиолой ✨ \n💰 Цена: 3 990 ₽`,
    url: "https://florimondi.ru/catalog/korobki-tsvetov/shlyapnaya-korobochka-s-sadovoy-rozoy-i-mattioloy/",
  },
  {
    photo:
      "https://florimondi.ru/upload/resize_cache/webp/iblock/1ec/41lapirmcai6t3p6p7fvut006fb1ne4z.webp",
    caption: `🌸 Шляпная коробочка с алыми французскими розами ☕\n💰 Цена: 3 990 ₽`,
    url: "https://florimondi.ru/catalog/korobki-tsvetov/shlyapnaya-korobochka-s-alymi-frantsuzskimi-rozami/",
  },
  {
    photo:
      "https://florimondi.ru/upload/resize_cache/webp/iblock/2fb/5pqavdop6at62g9bemvtmhnaamj2xdwc.webp",
    caption: `🌸 Шляпная коробочка с лавандовыми французскими розами ☕\n💰 Цена: 3 990 ₽`,
    url: "https://florimondi.ru/catalog/korobki-tsvetov/shlyapnaya-korobochka-s-lavandovymi-frantsuzskimi-rozami/",
  },
  {
    photo:
      "https://florimondi.ru/upload/resize_cache/webp/iblock/b20/79c848yng6gl3qxfwnlvsim3yxrvv65i.webp",
    caption: `🌸 Шляпная коробочка с малиновыми французскими розами ☕\n💰 Цена: 3 990 ₽`,
    url: "https://florimondi.ru/catalog/korobki-tsvetov/shlyapnaya-korobochka-s-malinovymi-frantsuzskimi-rozami/",
  },
];

const slidesFor10moreK = [
  {
    photo:
      "https://florimondi.ru/upload/resize_cache/webp/iblock/7fe/y5oxh2n0nw3ifo85d6flb3onevhzt15v.webp",
    caption:
      "🌸 Монобукет из кустовой пионовидной розы и веточек эвкалипта \n💰 Цена: 3 990 ₽",
    url: "https://florimondi.ru/catalog/raskidistye-bukety-tsvetov/monobuket-iz-kustovoy-pionovidnoy-rozy-i-vetochek-evkalipta/",
  },
  {
    photo:
      "https://florimondi.ru/upload/resize_cache/webp/iblock/718/leokgv9ajcxhppm6rbp54zy8k1ebko96.webp",
    caption: '💐 Букет с розой Вайт О\'Хара "Замечательный" \n💰 Цена: 4 290 ₽',
    url: "https://florimondi.ru/catalog/raskidistye-bukety-tsvetov/buket-s-rozoy-vayt-o-khara-zamechatelnyy/",
  },
  {
    photo:
      "https://florimondi.ru/upload/resize_cache/webp/iblock/706/m1wnj9peusz3ji4hlwe8hjl79igblbzv.webp",
    caption:
      '🎁 Авторский букет из садовой розы и нарциссов "Диковинный". \n💰 Цена: 4 590 ₽',
    url: "https://florimondi.ru/catalog/raskidistye-bukety-tsvetov/avtorskiy-buket-iz-sadovoy-rozy-i-nartsissov-dikovinnyy/",
  },
  {
    photo:
      "https://florimondi.ru/upload/resize_cache/webp/iblock/fa6/x1c95xh7fbaysgmnxo0v7usmusenv6km.webp",
    caption:
      "🎁 Раскидистый букет с лизиантусом и кустовой пионовидной розой. \n💰 Цена: 4 990 ₽",
    url: "https://florimondi.ru/catalog/raskidistye-bukety-tsvetov/raskidistyy-buket-s-liziantusom-i-kustovoy-pionovidnoy-rozoy/",
  },
];

async function sendSlide(chatId, slideIndex, message_id) {
  const user = await collectionUser.findOne({ userId: chatId });
  if (!user) {
    return;
  }
  const keyboardFor10moreK = {
    inline_keyboard: [
      [
        slidesFor10moreK[slideIndex]?.url
          ? { text: "Купить", url: slidesFor10moreK[slideIndex].url }
          : { text: "Купить", callback_data: "disable" },
      ],
      [
        { text: "⬅️ Назад", callback_data: `prev_${slideIndex}` },
        { text: "Вперёд ➡️", callback_data: `next_${slideIndex}` },
      ],
    ],
  };
  // Inline-кнопки для навигации
  const keyboardFor10k = {
    inline_keyboard: [
      [
        slidesFor10k[slideIndex]?.url
          ? { text: "Купить", url: slidesFor10k[slideIndex].url } // Используем URL, если он есть
          : { text: "Купить", callback_data: "disable" }, // Заглушка, если ссылки нет
      ],
      [
        { text: "⬅️ Назад", callback_data: `prev_${slideIndex}` },
        { text: "Вперёд ➡️", callback_data: `next_${slideIndex}` },
      ],
    ],
  };
  // Деактивация кнопки "Назад" на первом слайде
  const keyboardFor7k = {
    inline_keyboard: [
      [
        slidesFor7k[slideIndex]?.url
          ? { text: "Купить", url: slidesFor7k[slideIndex].url } // Используем URL, если он есть
          : { text: "Купить", callback_data: "disable" }, // Заглушка, если ссылки нет
      ],
      [
        { text: "⬅️ Назад", callback_data: `prev_${slideIndex}` },
        { text: "Вперёд ➡️", callback_data: `next_${slideIndex}` },
      ],
    ],
  };
  const keyboardFor4k = {
    inline_keyboard: [
      [
        slidesFor4k[slideIndex]?.url
          ? { text: "Купить", url: slidesFor4k[slideIndex].url } // Используем URL, если он есть
          : { text: "Купить", callback_data: "disable" }, // Заглушка, если ссылки нет
      ],
      [
        { text: "⬅️ Назад", callback_data: `prev_${slideIndex}` },
        { text: "Вперёд ➡️", callback_data: `next_${slideIndex}` },
      ],
    ],
  };
  if (slideIndex == 0) {
  }
  // Изменение кнопок в зависимости от текущего слайда
  if (slideIndex === 0 && user.processType === "catalog_price=4000") {
    keyboardFor4k.inline_keyboard[0][0] = {
      text: "Купить",
      callback_data: `buy_${slideIndex}`,
      url: slidesFor4k[slideIndex].url,
    };
    keyboardFor4k.inline_keyboard[1][0] = {
      text: "⬅️ Назад",
      callback_data: `disable`,
    };
  }
  if (slideIndex === 0 && user.processType === "catalog_price=8000") {
    keyboardFor7k.inline_keyboard[0][0] = {
      text: "Купить",
      callback_data: `buy_${slideIndex}`,
      url: slidesFor7k[slideIndex].url,
    };
    keyboardFor7k.inline_keyboard[1][0] = {
      text: "⬅️ Назад",
      callback_data: `disable`,
    };
  }
  if (
    slideIndex === slidesFor4k.length - 2 &&
    user.processType === "catalog_price=4000"
  ) {
    keyboardFor4k.inline_keyboard[1][0] = {
      text: "⬅️ Назад",
      callback_data: `prev_${slideIndex}`,
    };
  }
  if (
    slideIndex === slidesFor7k.length - 2 &&
    user.processType === "catalog_price=8000"
  ) {
    keyboardFor7k.inline_keyboard[1][0] = {
      text: "⬅️ Назад",
      callback_data: `prev_${slideIndex}`,
    };
  }
  if (
    slideIndex === slidesFor4k.length - 1 &&
    user.processType === "catalog_price=4000"
  ) {
    keyboardFor4k.inline_keyboard[1][1] = {
      text: "Вперёд ➡️",
      callback_data: "disable",
    };
  }
  if (
    slideIndex === slidesFor7k.length - 1 &&
    user.processType === "catalog_price=8000"
  ) {
    keyboardFor7k.inline_keyboard[1][1] = {
      text: "Вперёд ➡️",
      callback_data: "disable",
    };
  }
  if (
    slideIndex === slidesFor10k.length - 1 &&
    user.processType === "catalog_price=10000"
  ) {
    keyboardFor10k.inline_keyboard[1][1] = {
      text: "Вперёд ➡️",
      callback_data: "disable",
    };
  }
  if (
    slideIndex === slidesFor10moreK.length - 1 &&
    user.processType === "catalog_price=10000++"
  ) {
    keyboardFor10moreK.inline_keyboard[1][1] = {
      text: "Вперёд ➡️",
      callback_data: "disable",
    };
  }
  if (user.processType === "catalog_price=4000") {
    console.log(user.processType);

    const slide = slidesFor4k[slideIndex];
    const message = await bot.sendPhoto(chatId, slide.photo, {
      caption: slide.caption,
      reply_markup: keyboardFor4k,
    });

    await collectionUser.updateOne(
      { userId: chatId },
      { $set: { message_to_delete: message.message_id } },
      {
        new: true,
      }
    );
  } else if (user.processType === "catalog_price=8000") {
    const slide = slidesFor7k[slideIndex];
    const message = await bot.sendPhoto(chatId, slide.photo, {
      caption: slide.caption,
      reply_markup: keyboardFor7k,
    });
    await collectionUser.updateOne(
      { userId: chatId },
      { $set: { message_to_delete: message.message_id } },
      {
        new: true,
      }
    );
  } else if (user.processType === "catalog_price=10000") {
    const slide = slidesFor10k[slideIndex];
    const message = await bot.sendPhoto(chatId, slide.photo, {
      caption: slide.caption,
      reply_markup: keyboardFor10k,
    });
    await collectionUser.updateOne(
      { userId: chatId },
      { $set: { message_to_delete: message.message_id } },
      {
        new: true,
      }
    );
  } else if (user.processType === "catalog_price=10000++") {
    const slide = slidesFor10moreK[slideIndex];
    const message = await bot.sendPhoto(chatId, slide.photo, {
      caption: slide.caption,
      reply_markup: keyboardFor10moreK,
    });
    await collectionUser.updateOne(
      { userId: chatId },
      { $set: { message_to_delete: message.message_id } },
      {
        new: true,
      }
    );
  }
  // Отправляем сообщение с кнопками
}
app.listen(3003, () => {
  console.log(`Сервер запущен на http://localhost:${3000}`);
});
