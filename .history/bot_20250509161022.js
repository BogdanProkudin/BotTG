import TelegramBot from 'node-telegram-bot-api';
import { generateCalendar, getMonthName } from './calendar.js';
import { MongoClient } from 'mongodb';
import Robokaska from 'robokassa';
import { Calendar } from 'telegram-inline-calendar';
import { getAvailableShippingTime } from './avaliableShippingTime.js';
import cors from 'cors';
import { Readable } from 'stream';

import dotenv from 'dotenv';
dotenv.config();
import express from 'express';

import crypto from 'crypto';
import { startAddProcess, cancelProcess, startEditProcess } from './processes/processes.js';
import validateAddress, { getAddressFromCoordinates } from './validateAddress.js';
import axios from 'axios';
import { console } from 'inspector';

// Вставьте токен вашего бота
const BOT_TOKEN = process.env.BOT_TOKEN;
const app = express();
console.log('🟢 Файл bot.js начал выполнение'); // Проверим, запускается ли скрипт вообще
app.use(cors());
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get('/result', (req, res) => {
  console.log('Hello World!');

  return res.status(200).json({ message: 'Transaction completed successfully' });
});
app.get('/fail', (req, res) => {
  return res.status(200).json({ message: 'Transaction failed' });
});

// Вспомогательная функция для вычисления контрольной суммы (SignatureValue)
function calculateSignature(OutSum, InvId, password2, additionalParams = '') {
  const baseString = `${OutSum}:${InvId}:${password2}`;
  const hash = md5(baseString);
  return hash;
}

// Функция для обработки уведомления от Robokassa на ResultURL

let db;
let collectionUser;
let collectionProduct;
let collectionCategory;

console.log('🟡 Пытаюсь подключиться к MongoDB...');
MongoClient.connect(
  'mongodb+srv://quard:Screaper228@cluster0.zyg0fil.mongodb.net/?retryWrites=true&w=majority',
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
)
  .then((client) => {
    db = client.db();
    collectionUser = db.collection('dbUser');
    collectionProduct = db.collection('db1');
    collectionCategory = db.collection('flower-category');
    console.log('Connected to MongoDB');
  })
  .catch((err) => {
    console.error('Error connecting to MongoDB', err);
  });

async function processPaymentNotification(req, res) {
  // Получаем параметры из запроса Robokassa
  try {
    if (!req.body) {
      return res.status(400).json({ message: 'Bad request' });
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
    const password2 = 'VPXkrnNyoI9865vDif2k';
    if (!collectionUser) {
      return;
    }

    const invIdNumber = Number(InvId);
    const user = await collectionUser.findOne({ invId: invIdNumber });

    // Генерация строки для вычисления контрольной суммы
    let additionalParamsString = '';
    if (Object.keys(additionalParams).length > 0) {
      additionalParamsString = Object.entries(additionalParams)
        .map(([key, value]) => `${key}=${value}`)
        .join(':');
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
      return res.status(400).json({ message: 'Bad request' });
    }
    if (!SignatureValue) {
      return res.status(400).json({ message: 'Bad request' });
    }
    // Проверка, совпадает ли контрольная сумма
    if (calculatedHash.toUpperCase() === SignatureValue.toUpperCase()) {
      // Проверка тестового режима
      if (IsTest === '1') {
        console.log(
          `Тестовый режим! Оплата успешна. InvId: ${InvId}, Сумма: ${OutSum}, Email: ${EMail}`
        );
      } else {
        console.log(`Оплата успешно прошла! InvId: ${InvId}, Сумма: ${OutSum}, Email: ${EMail}`);
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
          `📞 *Номер телефона заказчика:* ${
            user.clientNumber ? user.clientNumber : 'Не указан номер'
          }\n` +
          `📞 *Номер телефона получателя:* ${
            user.recipientNumber ? user.recipientNumber : 'Не указан номер'
          }\n` +
          `📍 *Адрес доставки:* ${user.address ? user.address : 'Не указан адрес'}\n` +
          `📅 *Дата доставки:* ${user.selectedDate ? user.selectedDate : 'Не указана дата'}\n` +
          `⏰Время доставки:* ${
            user.address !== 'Самовывоз' ? 'Время доставки' : 'Удобное время для самовывоза'
          }* ${user.time ? user.time : 'Не указано время'}\n` +
          `📝 *Текст для открытки:* ${user.postcard ? user.postcard : 'Не указано'}\n\n` +
          `📝 *Дополнительная информация:* ${
            user.extraInformation ? user.extraInformation : 'Не указано'
          }\n\n`,
        {
          parse_mode: 'Markdown',
        }
      );
      await bot.sendMessage(
        user.userId,
        `✅ *Оплата успешно прошла!*\n\n` +
          `💰 *Цена:* ${user.price}\n` +
          `📧 *Email:* ${EMail}\n` +
          `📷 *Ссылка на фото:* [Открыть фото](${photoUrl})\n` +
          `📞 *Номер телефона заказчика:* ${
            user.clientNumber ? user.clientNumber : 'Не указан номер'
          }\n` +
          `📞 *Номер телефона получателя:* ${
            user.recipientNumber ? user.recipientNumber : 'Не указан номер'
          }\n` +
          `📍 *Адрес доставки:* ${user.address ? user.address : 'Не указан адрес'}\n` +
          `📅 *Дата доставки:* ${user.selectedDate ? user.selectedDate : 'Не указана дата'}\n` +
          `⏰ *Время доставки/Удобное время для самовывоза:* ${
            user.time ? user.time : 'Не указано время'
          }\n` +
          `📝 *Текст для открытки:* ${user.postcard ? user.postcard : 'Не указано'}\n\n` +
          `📝 *Дополнительная информация:* ${
            user.extraInformation ? user.extraInformation : 'Не указано'
          }\n\n`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [['Вернуться в главное меню']],
            resize_keyboard: true, // Делает кнопки компактными
            one_time_keyboard: true, // Убирает клавиатуру после нажатия
          },
        }
      );
      await collectionUser.updateOne(
        { userId: user.userId },
        { $set: { processType: 'finished' } }
      );
    } else {
      // Контрольные суммы не совпали — ошибка
      console.error(`Ошибка верификации для InvId: ${InvId}`);

      // Отправляем ошибку или просто ничего не отправляем
      res.status(400).send('Error');
    }
  } catch (e) {
    console.log(e);
  }
}
app.post('/payment-success', processPaymentNotification);

// Функция обработки фото
async function handlePhoto(userId, photoFileId) {
  const user = await collectionUser.findOne({ userId });
  console.log(user.step);

  if (user && user.step === 'getIndex') {
    return 'Пожалуйста, отправьте номер предмета, который хотите отредактировать.';
  }
  if (!user || user.step !== 'getPhoto') {
    return;
  }

  // Сохранение фото в базе данных
  await collectionUser.updateOne({ userId }, { $set: { photo: photoFileId } });

  // Обновляем шаг процесса
  await collectionUser.updateOne({ userId }, { $set: { step: 'getPrice' } });

  return 'Фото получено! Теперь отправьте цену товара.';
}

// Функция обработки цены
async function handlePrice(userId, priceText) {
  const price = parseFloat(priceText);
  if (isNaN(price) || price <= 0) {
    return 'Пожалуйста, отправьте корректную цену товара. Например: 100, 199.99';
  }

  const user = await collectionUser.findOne({ userId });
  if (!user || user.step !== 'getPrice') {
    return;
  }

  // Сохранение цены в базе данных
  await collectionUser.updateOne({ userId }, { $set: { price } });

  // Сохранение товара в коллекцию продуктов
  const userPhoto = user.photo;
  if (user.processType === 'edit') {
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
    return 'Товар успешно обновлен в базе данных!';
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

  return 'Товар успешно добавлен в базу данных!';
}

// Функция для редактирования товара по индексу
async function handleEdit(userId, index) {
  const user = await collectionUser.findOne({ userId });
  if (!user || user.processType !== 'edit') {
    return;
  }

  if (isNaN(index) || index <= 0 || index > 100) {
    return 'Пожалуйста, укажите корректный порядковый номер товара.';
  }
  const indexInt = parseInt(index);
  const document = await collectionProduct
    .find()
    .skip(indexInt - 1)
    .limit(1)
    .next();
  if (!document) {
    return 'Предмет с таким индексом не найден. Попробуйте снова.';
  }

  await collectionUser.updateOne(
    { userId },
    { $set: { step: 'getPhoto', productId: document._id } }
  );

  return 'Предмет найден! Отправьте новое фото товара.';
}
function md5(string) {
  return crypto.createHash('md5').update(string).digest('hex').toUpperCase();
}

// Включаем тестовый режим, если нужно

function generatePaymentLink(merchantLogin, password1, invId, outSum, description, isTest = false) {
  // Формируем JSON-объект с фискальным чеком (54-ФЗ)
  const receipt = {
    items: [
      {
        name: 'Букет цветов', // Название товара
        quantity: 1, // Количество
        sum: outSum, // Сумма

        tax: 'none', // Тип налога ("none", "vat0", "vat10", "vat20" и т. д.)
      },
    ],
  };

  // Преобразуем чек в JSON-строку
  const receiptString = JSON.stringify(receipt);
  console.log(receiptString);

  // URL-кодируем один раз для подписи
  const encodedReceiptForSignature = encodeURIComponent(receiptString);

  // Формируем строку для подписи (SignatureValue)
  const signatureString = `${merchantLogin}:${outSum}:${invId}:${encodedReceiptForSignature}:${password1}`;
  const signatureValue = crypto.createHash('md5').update(signatureString).digest('hex');

  // Дважды URL-кодируем чек для передачи в ссылке
  const doubleEncodedReceipt = encodeURIComponent(encodedReceiptForSignature);

  // Формируем URL для оплаты
  let paymentLink = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${outSum}&InvoiceID=${invId}&Description=${encodeURIComponent(
    description
  )}&SignatureValue=${signatureValue}&Receipt=${doubleEncodedReceipt}&Encoding=utf-8&Culture=ru`;

  // Включаем тестовый режим, если нужно
  if (isTest) {
    paymentLink += '&IsTest=1';
  }

  return paymentLink;
}

// Пример использования:

// Товары в заказе

bot.onText(/\/location/, async (msg) => {
  const chatId = msg.chat.id;

  // Отправляем кнопку для отправки местоположения
  await bot.sendMessage(chatId, 'Пожалуйста, отправьте свое местоположение', {
    reply_markup: {
      keyboard: [
        [
          {
            text: 'Отправить местоположение',
            request_location: true, // Это запрос местоположения
          },
        ],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
});
bot.on('location', async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;
  console.log('locaton');
  if (!collectionUser) {
    return;
  }
  const user = await collectionUser.findOne({ userId: chatId });
  if (!user) {
    return;
  }
  if (user.processType === 'send_location') {
    const availableTimes = await getAvailableShippingTime(user);
    const address = await getAddressFromCoordinates(latitude, longitude);
    if (
      address !==
      'К сожалению, мы не можем найти ваш адрес. Пожалуйста, убедитесь, что адрес находится в Москве и вы указываете точное местоположение.'
    ) {
      console.log(address);
      await bot.sendMessage(
        chatId,
        `Ваш адрес: ${address}\n` + 'Теперь укажите примерное время доставки',
        {
          reply_markup: {
            keyboard: [...availableTimes, ['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
      await collectionUser.updateOne(
        { userId: chatId },
        { $set: { address, processType: 'select_time' } }
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
  console.log(chatId, 'chatId');
  const chatType = msg.chat.type; // 'private', 'group', 'supergroup'
  if (chatType === 'supergroup') {
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
    await bot.sendMessage(chatId, 'Вы не можете начать новое действие, пока не завершите текущее.');
    return;
  }
  // Приветственное сообщение с использованием Markdown
  bot.setMyCommands([
    {
      command: '/menu',
      description: 'Возвращает вас в главное меню',
    },
  ]);
  console.log('start');

  await bot.sendMessage(
    chatId,
    '*Добро пожаловать в наш цветочный магазин!* 💐\n\n' +
      '🌷 Здесь вы найдете свежие цветы и стильные букеты.\n' +
      '🚀 Быстрая доставка прямо к вам!\n\n' +
      'Чтобы сделать заказ, выберите нужный раздел в меню. \n\n' +
      '_Спасибо, что выбираете нас!_ ❤️',
    { parse_mode: 'Markdown' }
  );

  // Сообщение с кнопками
  await bot.sendMessage(chatId, 'Что хотите сделать?', {
    reply_markup: {
      keyboard: [
        ['Онлайн-витрина', 'Наш каталог'],
        ['О нас', 'Мы на карте', 'Наш сайт'], // Кнопки в одном ряду
        ['Поддержка'],
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
  if (chatType === 'supergroup') {
    return; // Игнорируем команды в группе
  }
  if (!collectionUser) {
    return;
  }
  if (
    userId !== 833391720 &&
    userId !== 6103809590 &&
    userId !== 5600075299 &&
    userId !== 1941288913 &&
    userId !== 5557790556 &&
    userId !== 1218030672
  ) {
    return;
  }
  const user = await collectionUser.findOne({ userId });
  if (user && user.isInProcess) {
    await bot.sendMessage(
      chatId,
      'Вы не можете начать новое действие, пока не завершите текущее.',
      {
        reply_markup: {
          keyboard: [['Назад']],
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
      keyboard: [['Назад']],
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
  if (chatType === 'supergroup') {
    return; // Игнорируем команды в группе
  }
  if (!collectionUser) {
    return;
  }
  if (
    userId !== 833391720 &&
    userId !== 6103809590 &&
    userId !== 5600075299 &&
    userId !== 1941288913 &&
    userId !== 5557790556 &&
    userId !== 1218030672
  ) {
    return;
  }
  const user = await collectionUser.findOne({ userId });
  if (user && user.isInProcess) {
    await bot.sendMessage(chatId, 'Вы не можете начать новое действие, пока не завершите текущее.');
    return;
  }
  const message = await startEditProcess(userId, collectionUser);

  await bot.sendMessage(chatId, message, {
    reply_markup: {
      keyboard: [['Назад']],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
});

bot.onText(/\/delete/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const chatType = msg.chat.type; // 'private', 'group', 'supergroup'
  if (chatType === 'supergroup') {
    return; // Игнорируем команды в группе
  }
  if (!collectionUser) {
    return;
  }
  if (
    userId !== 833391720 &&
    userId !== 6103809590 &&
    userId !== 5600075299 &&
    userId !== 1941288913 &&
    userId !== 5557790556 &&
    userId !== 1218030672
  ) {
    return;
  }
  const user = await collectionUser.findOne({ userId });
  if (user && user.isInProcess) {
    await bot.sendMessage(chatId, 'Вы не можете начать новое действие, пока не завершите текущее.');
    return;
  }
  await bot.sendMessage(chatId, 'Отправьте порядковый номер товара, который хотите удалить.', {
    reply_markup: {
      keyboard: [['Назад']],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
  await collectionUser.updateOne(
    { userId },
    {
      $set: {
        isInProcess: true,
        processType: 'delete',
      },
    },
    { upsert: true }
  );

  // collectionProduct
  //   .find()
  //   .skip(index)
  //   .limit(1)
  //   .toArray()
  //   .then((docs) => {
  //     if (docs.length > 0) {
  //       collectionProduct.deleteOne({ _id: docs[0]._id });
  //       :Удален документ с _id:", docs[0]._id);
  //     } else {
  //       console.log("Документ с таким индексом не найден");
  //     }
  //   });
});

bot.onText(/^\/reply (\d+) (.+)/s, async (msg, match) => {
  const adminId = msg.from.id;
  const userId = parseInt(match[1]); // ID пользователя
  const replyText = match[2]; // Ответ от админа

  try {
    // Получаем пользователя из базы
    const user = await collectionUser.findOne({ userId });

    if (!user) {
      return await bot.sendMessage(adminId, '❌ Пользователь не найден.');
    }

    // Проверяем, в разделе ли он поддержки
    if (user.processType === 'support') {
      await bot.sendMessage(userId, `📬 Ответ поддержки:\n\n${replyText}`);
    } else {
      await bot.sendMessage(
        -1002572728889,
        `⚠️ Пользователь с айди ${userId} не в разделе поддержки.`
      );
    }
  } catch (err) {
    await bot.sendMessage(-1002572728889, `❌ Ошибка при отправке: ${err.message}`);
  }
});

// Обработчик кнопки "Назад"
bot.on('text', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim();
  try {
    if (!collectionUser) {
      return;
    }
    const chatType = msg.chat.type; // 'private', 'group', 'supergroup'
    if (chatType === 'supergroup') {
      return; // Игнорируем команды в группе
    }
    const user = await collectionUser.findOne({ userId });
    if (text === 'Вернуться в главное меню' && user.processType === 'finished') {
      await collectionUser.updateOne(
        { userId },
        { $set: { isInProcess: false, processType: null } }
      );

      await bot.sendMessage(chatId, 'Вы вернулись в главное меню.', {
        reply_markup: {
          keyboard: [
            ['Онлайн-витрина', 'Наш каталог'],
            ['О нас', 'Мы на карте', 'Наш сайт'],
            ['Поддержка'],
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

    if (text === 'Назад' && user.processType && user.processType === 'support') {
      console.log('user вышел');
    }
    if (text === 'Поддержка' && !user.isInProcess) {
      console.log('user в поддержке');
      await bot.sendMessage(
        chatId,
        '📝 Пожалуйста, опишите вашу проблему или вопрос. Наша поддержка свяжется с вами в ближайшее время.',
        {
          reply_markup: {
            keyboard: [['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );

      await collectionUser.updateOne(
        { userId },
        { $set: { processType: 'support', isInProcess: true } }
      );
    }

    if (
      text !== 'Назад' &&
      user.isInProcess &&
      user.processType === 'support' &&
      text !== '/menu'
    ) {
      try {
        // Сохраняем обращение и пересылаем админам
        const supportText = `✉️ Новое обращение от пользователя:
  ID: ${userId}
  Имя: ${msg.from.first_name}
  Юзернейм: @${msg.from.username || 'нет'}

  Сообщение: ${text}`;

        const ADMIN_CHAT_ID = -1002572728889;

        await bot.sendMessage(ADMIN_CHAT_ID, supportText);
        await bot.sendMessage(chatId, 'Ваше сообщение передано в поддержку. Ожидайте ответа.');
      } catch (error) {
        await bot.sendMessage(ADMIN_CHAT_ID, 'Произошла ошибка при отправке сообщения ');
        await bot.sendMessage(chatId, 'Произошла ошибка при отправке сообщения');
      }
    }

    if (text === 'Назад' && user.processType !== 'finished') {
      if (
        (user && user.processType === 'catalog_price=4000') ||
        (user && user.processType === 'catalog_price=8000') ||
        (user && user.processType === 'catalog_price=10000') ||
        (user && user.processType === 'catalog_price=10000++')
      ) {
        const message = await cancelProcess(userId, collectionUser);

        const user = await collectionUser.findOne({ userId });
        if (!user) {
          return;
        }
        const deletedPhotoIds = user.photo_to_delete;
        if (deletedPhotoIds && deletedPhotoIds.length > 0) {
          deletedPhotoIds.forEach((photoId) => {
            bot.deleteMessage(chatId, photoId);
          });
        }

        await bot.sendMessage(chatId, message, {
          reply_markup: {
            keyboard: [['Монобукеты', 'Корзины'], ['Раскидистые букеты', 'Коробки'], ['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        await collectionUser.updateOne(
          { userId },
          { $set: { message_to_delete: null, photo_to_delete: [] } }
        );
        return;
      }
      if (user && user.processType && user.processType === 'payment') {
        const message = await cancelProcess(userId, collectionUser);
        await bot.sendMessage(chatId, message, {
          reply_markup: {
            keyboard: [['Перейти к оплате'], ['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        return;
      }
      if (user && user.processType && user.processType === 'prepare_payment') {
        const message = await cancelProcess(userId, collectionUser);
        await bot.sendMessage(chatId, message, {
          reply_markup: {
            keyboard: [['Перейти к оплате'], ['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        return;
      }
      if (user && user.processType && user.processType === 'select_date') {
        const message = await cancelProcess(userId, collectionUser);
        const user = await collectionUser.findOne({ userId });
        if (!user) {
          return;
        }
        await bot.sendMessage(chatId, message, {
          reply_markup: {
            keyboard: [
              ['Онлайн-витрина', 'Наш каталог'],
              ['О нас', 'Мы на карте', 'Наш сайт'],
              ['Поддержка'],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        const deletedPhotoIds = user.photo_to_delete;
        if (deletedPhotoIds && deletedPhotoIds.length > 0) {
          deletedPhotoIds.forEach((photoId) => {
            bot.deleteMessage(chatId, photoId);
          });
        }
        if (Array.isArray(user.message_to_delete) && user.message_to_delete.length > 0) {
          for (const messageId of user.message_to_delete) {
            console.log('delete message on nazad');
            await bot.deleteMessage(chatId, messageId);
          }
        } else if (typeof user.message_to_delete === 'number') {
          console.log('delete message on nazad2');

          await bot.deleteMessage(chatId, user.message_to_delete);
        }
        await collectionUser.updateOne(
          { userId },
          { $set: { message_to_delete: null, photo_to_delete: [] } }
        );
        return;
      }
      if (user && user.processType && user.processType === 'who_is_client') {
        const message = await cancelProcess(userId, collectionUser);
        await bot.sendMessage(chatId, message, {
          reply_markup: {
            keyboard: [['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        return;
      }
      if (user && user.processType && user.processType === 'client_number') {
        const message = await cancelProcess(userId, collectionUser);
        const availableTimes = getAvailableShippingTime(user);
        await bot.sendMessage(chatId, message, {
          reply_markup: {
            keyboard: [...availableTimes, ['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        return;
      }
      if (
        user &&
        user.processType &&
        user.processType === 'recipient_number' &&
        (user.whoIsClient === 'Другой человек' || user.whoIsClient === '2')
      ) {
        const message = await cancelProcess(userId, collectionUser);
        await bot.sendMessage(chatId, message, {
          reply_markup: {
            keyboard: [['Я', 'Другой человек'], ['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        return;
      }
      if (user && user.processType && user.processType === 'extra_information') {
        console.log('exit');

        const message = await cancelProcess(userId, collectionUser);
        await bot.sendMessage(chatId, message, {
          reply_markup: {
            keyboard: [['Перейти дальше'], ['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        return;
      }
      if (
        user &&
        user.processType &&
        user.processType === 'postcard' &&
        user.address === 'Самовывоз'
      ) {
        console.log('exit где нужно');

        const message = await cancelProcess(userId, collectionUser);
        await bot.sendMessage(chatId, message, {
          reply_markup: {
            keyboard: [['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        return;
      }
      if (
        user &&
        user.processType &&
        user.processType === 'postcard' &&
        (user.whoIsClient === 'Я' || user.whoIsClient === '1')
      ) {
        const message = await cancelProcess(userId, collectionUser);
        await bot.sendMessage(chatId, message, {
          reply_markup: {
            keyboard: [['Я', 'Другой человек'], ['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        return;
      }
      if (
        user &&
        user.processType &&
        user.processType === 'recipient_number' &&
        user.address !== 'Самовывоз'
      ) {
        const message = await cancelProcess(userId, collectionUser);
        const availableTimes = getAvailableShippingTime(user);

        await bot.sendMessage(chatId, message, {
          reply_markup: {
            keyboard: [...availableTimes, ['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        return;
      }
      if (
        user &&
        user.processType &&
        user.processType === 'postcard' &&
        (user.whoIsClient === 'Другой человек' ||
          user.whoIsClient === 'Я' ||
          user.whoIsClient === '1' ||
          user.whoIsClient === '2')
      ) {
        const message = await cancelProcess(userId, collectionUser);
        await bot.sendMessage(chatId, message, {
          reply_markup: {
            keyboard: [['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        return;
      }
      if (
        (user && user.processType && user.processType === 'send_location') ||
        (user && user.processType && user.processType === 'enter_address') ||
        (user && user.processType && user.processType === 'select_time')
      ) {
        const message = await cancelProcess(userId, collectionUser);
        await bot.sendMessage(chatId, message, {
          reply_markup: {
            keyboard: [['Ввести адрес', 'Самовывоз'], ['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        return;
      } else {
        const message = await cancelProcess(userId, collectionUser);
        const user = await collectionUser.findOne({ userId });
        if (!user) {
          return;
        }
        const deletedPhotoIds = await user.photo_to_delete;
        if (deletedPhotoIds && deletedPhotoIds.length > 0) {
          deletedPhotoIds.forEach((photoId) => {
            bot.deleteMessage(chatId, photoId);
          });
        }
        if (Array.isArray(user.message_to_delete) && user.message_to_delete.length > 0) {
          for (const messageId of user.message_to_delete) {
            console.log('delete message on nazad');
            await bot.deleteMessage(chatId, messageId);
          }
        } else if (typeof user.message_to_delete === 'number') {
          console.log('delete message on nazad2');

          await bot.deleteMessage(chatId, user.message_to_delete);
        }

        await collectionUser.updateOne(
          { userId },
          { $set: { photo_to_delete: [], message_to_delete: null } }
        );
        await bot.sendMessage(chatId, message, {
          reply_markup: {
            keyboard: [
              ['Онлайн-витрина', 'Наш каталог'],
              ['О нас', 'Мы на карте', 'Наш сайт'],
              ['Поддержка'],
            ],
            resize_keyboard: true, // Делает кнопки компактными
            one_time_keyboard: true, // Убирает клавиатуру после нажатия
          },
        });
      }
    }
  } catch (e) {
    console.log('Error has to fix', e);
  }
});

// Обработчик фотографий
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const user = await collectionUser.findOne({ userId });

  if (user && user.step === 'getIndex') {
    return bot.sendMessage(
      chatId,
      'Пожалуйста, отправьте номер предмета, который хотите отредактировать.'
    );
  }
  if (user && user.step !== 'getPhoto') {
    return;
  }

  const photo = msg.photo[msg.photo.length - 1];
  const fileId = photo.file_id;

  const message = await handlePhoto(userId, fileId);
  await bot.sendMessage(chatId, message);
});

// Обработчик текстовых сообщений (для получения цены товара)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!collectionUser || !collectionProduct) {
    return;
  }
  const chatType = msg.chat.type; // 'private', 'group', 'supergroup'
  if (chatType === 'supergroup') {
    return; // Игнорируем команды в группе
  }

  const user = await collectionUser.findOne({ userId });
  if (!user || !user.isInProcess) {
    return; // Не обрабатываем, если пользователь не в процессе
  }

  if (
    user.step === 'getPhoto' &&
    msg.text !== 'Назад' &&
    msg.text &&
    msg.text !== '/add' &&
    msg.text !== '/edit'
  ) {
    setTimeout(() => bot.sendMessage(chatId, 'Пожалуйста, отправьте фото товара.'), 300);
  } else if (
    user.step === 'getPrice' &&
    msg.text !== 'Назад' &&
    msg.text &&
    msg.text !== '/add' &&
    msg.text !== '/edit' &&
    msg.text[0] !== '/'
  ) {
    const message = await handlePrice(userId, msg.text);
    if (message === 'Пожалуйста, отправьте корректную цену товара. Например: 100, 199.99') {
      await bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [['Назад']],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    } else {
      await bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [
            ['Онлайн-витрина', 'Наш каталог'],
            ['О нас', 'Мы на карте', 'Наш сайт'],
            ['Поддержка'],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    }
  } else if (
    user.step === 'getIndex' &&
    msg.text !== 'Назад' &&
    msg.text &&
    msg.text !== '/add' &&
    msg.text !== '/edit' &&
    msg.text[0] !== '/'
  ) {
    const message = await handleEdit(userId, msg.text);
    await bot.sendMessage(chatId, message);
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;
  const chatType = msg.chat.type; // 'private', 'group', 'supergroup'
  console.log(chatType);
  try {
    if (chatType === 'supergroup') {
      return; // Игнорируем команды в группе
    }
    if (!collectionUser || !collectionProduct) {
      console.log('collectionUser or collectionProduct is null');
      return;
    }
    const user = await collectionUser.findOne({ userId });
    if (text === '/menu' && user) {
      await bot.sendMessage(chatId, 'Вы отменили все действия. Возвращаемся в главное меню.', {
        reply_markup: {
          keyboard: [
            ['Онлайн-витрина', 'Наш каталог'],
            ['О нас', 'Мы на карте', 'Наш сайт'],
            ['Поддержка'],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      if (Array.isArray(user.message_to_delete) && user.message_to_delete.length > 0) {
        for (const messageId of user.message_to_delete) {
          try {
            await bot.deleteMessage(chatId, messageId);
          } catch (error) {
            console.error(`Ошибка при удалении сообщения ${messageId}:`, error.message);
          }
        }
      } else if (typeof user.message_to_delete === 'number') {
        try {
          await bot.deleteMessage(chatId, user.message_to_delete);
        } catch (error) {
          console.error(`Ошибка при удалении сообщения ${user.message_to_delete}:`, error.message);
        }
      }

      if (user.photo_to_delete) {
        user.photo_to_delete.forEach((photoId) => {
          bot.deleteMessage(chatId, photoId);
        });
      }
      await collectionUser.findOneAndUpdate(
        { userId },
        {
          $set: {
            isInProcess: false,
            processType: null,
            message_to_delete: null,
            MKAD: null,
            address: null,
            clientNumber: null,
            selectedDate: null,
            whoIsClient: null,
            currentShow: null,
            recipientNumber: null,
            photo_to_delete: [],
            time: null,
            step: null,
          },
        }
      );
      return;
    }

    if (
      !user ||
      (user.isInProcess &&
        user.processType !== 'showcase' &&
        user.processType !== 'select_date' &&
        user.processType !== 'prepare_address' &&
        user.processType !== 'send_location' &&
        user.processType !== 'enter_address' &&
        user.processType !== 'select_time' &&
        user.processType !== 'recipient_number' &&
        user.processType !== 'extra_information' &&
        user.processType !== 'catalog' &&
        user.processType !== 'catalog_price=4000' &&
        user.processType !== 'catalog_price=8000' &&
        user.processType !== 'catalog_price=15000' &&
        user.processType !== 'client_number' &&
        user.processType !== 'who_is_client' &&
        user.processType !== 'postcard' &&
        user.processType !== 'prepare_payment' &&
        user.processType !== 'delete' &&
        user.processType !== 'showcase1' &&
        user.processType !== 'showcase2')
    ) {
      console.log('User is in process');

      return; // Не обрабатываем, если пользователь в процессе
    }

    if (user.processType === 'delete') {
      const index = parseInt(text, 10);
      if ((isNaN(index) && text !== 'Назад') || (index <= 0 && text !== 'Назад')) {
        await bot.sendMessage(chatId, 'Пожалуйста, укажите корректный номер товара:');
        return;
      }
      collectionProduct
        .find()
        .skip(index - 1)
        .limit(1)
        .toArray()
        .then(async (docs) => {
          if (docs.length > 0) {
            collectionProduct.deleteOne({ _id: docs[0]._id });
            console.log('Удален документ с _id:', docs[0]._id);
            await bot.sendMessage(chatId, 'Вы ввели индекс, товар удален. Вы вышли из действия', {
              reply_markup: {
                resize_keyboard: true,
                one_time_keyboard: true,
              },
            });
            await collectionUser.updateOne(
              { userId },
              { $set: { isInProcess: false, processType: null } }
            );
          } else {
            console.log('Документ с таким индексом не найден');
          }
        });

      return;
    }

    if (text === 'Онлайн-витрина' && !user.isInProcess) {
      const products = await collectionProduct.find({ photo: { $exists: true } }).toArray();

      const count = await collectionProduct.countDocuments({
        photo: { $exists: true },
      });
      if (count === 0) {
        await bot.sendMessage(chatId, 'Нет фото для отображения.');
        return;
      }
      const keyboardText = await products
        .slice(0, 10)
        .map((product, index) => [
          `№${index + 1} ${product.price ? `${product.price} ₽` : 'Без цены'}`,
        ]);
      keyboardText.push(['Назад']);
      await bot.sendMessage(chatId, 'Добро пожаловать в нашу онлайн-витрину!', {
        reply_markup: {
          keyboard: keyboardText,
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      const mediaGroup = await products
        .filter((product) => product.photo)
        .map((product, index) => ({
          type: 'photo',
          media: product.photo,
          caption: `№${index + 1}: ${product.price || 'Без цены'} ₽`,
        }))
        .slice(0, 10);

      const messagePhotos = await bot.sendMediaGroup(chatId, mediaGroup);
      console.log(
        'messagePhotos',
        messagePhotos.map((item) => item.message_id)
      );
      const photoIds = messagePhotos.map((item) => item.message_id);
      await collectionUser.updateOne(
        { userId },
        {
          $set: { processType: 'showcase', isInProcess: true, currentIndex: 0 },
          $push: {
            photo_to_delete: { $each: photoIds },
          },
        }
      );

      console.log('count', count);

      if (count > 10) {
        const keyboard = [
          {
            text: 'Смотреть дальше',
            callback_data: 'nextt_product_10',
          },
        ];

        const messageWelcome = await bot.sendMessage(
          chatId,
          'Выберите товар или перейдите к следующему слайду:',
          {
            reply_markup: {
              inline_keyboard: [keyboard],
            },
          }
        );
        await collectionUser.updateOne(
          { userId: chatId },
          {
            $set: {
              message_to_delete: [messageWelcome.message_id],
            },
          }
        );
      }
    } else if (text.startsWith('№') && user.processType === 'showcase') {
      const productIndex = parseInt(text.match(/№(\d+)/)[1], 10) - 1;
      const product = await collectionProduct
        .find({ photo: { $exists: true } })
        .skip(productIndex)
        .limit(1)
        .toArray();

      if (!product.length) {
        await bot.sendMessage(chatId, 'Товар не найден.');
        return;
      }

      const selectedProduct = product[0];

      await collectionUser.updateOne(
        { userId },
        {
          $set: {
            selectedProduct,
            processType: 'select_date',
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
      await bot.sendMessage(chatId, 'Букет выбран!', {
        reply_markup: {
          keyboard: [['Назад']],
        },
      });
      const messageWithCalendar = await bot.sendMessage(
        chatId,
        '📅Пожалуйста, выберите удобную вам дату:          ',
        {
          reply_markup: {
            inline_keyboard: calendar,

            resize_keyboard: true,
          },
        }
      );
      await collectionUser.updateOne(
        { userId: chatId },
        {
          $push: {
            message_to_delete: messageWithCalendar.message_id,
          },
        }
      );
    } else if (user.processType === 'prepare_address') {
      if (text === 'Самовывоз') {
        const availableTimes = getAvailableShippingTime(user);
        console.log(availableTimes[0][0]);

        await bot.sendMessage(
          chatId,
          '🕒 *Укажите примерное время, когда вы заберёте товар.*\n\n' +
            `Выберите удобное время ниже.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [...availableTimes, ['Назад']],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
        setTimeout(async () => {
          await collectionUser.updateOne(
            { userId },
            {
              $set: {
                address: 'Самовывоз',
                MKAD: null,
                processType: 'select_time',
              },
            }
          );
        }, 700);
      } else if (text === 'Ввести адрес') {
        await bot.sendMessage(chatId, 'Укажите, какую доставку вы предпочитаете?', {
          reply_markup: {
            keyboard: [
              ['Доставка по Москве в пределах МКАД — 750 ₽'],
              ['Курьер за МКАД- Ближнее Подмосковье — 950 ₽'],
              ['Курьер за МКАД - область — 2000 ₽'],
            ],
          },
        });
      }
      // Если пользователь выбрал путь через текстовый адрес
      else if (
        text === 'Доставка по Москве в пределах МКАД — 750 ₽' ||
        text === 'Курьер за МКАД- Ближнее Подмосковье — 950 ₽' ||
        text === 'Курьер за МКАД - область — 2000 ₽'
      ) {
        await bot.sendMessage(
          chatId,
          '*Пожалуйста, введите свой адрес в следующем формате:*\n\n' +
            '*Город, Улица, Дом* (через запятую, с большой буквы).\n\n' +
            '*Пример:*\n' +
            "'Москва, Тверская улица, 7'.",
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [['Назад']],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
        await collectionUser.updateOne({ userId }, { $set: { MKAD: text } });
        // Обновление статуса пользователя в процессе
        await collectionUser.updateOne(
          { userId },
          { $set: { isInProcess: true, processType: 'enter_address' } }
        );
      }
    } else if (user.processType === 'enter_address' && text !== 'Назад') {
      const validationResponse = await validateAddress(text);
      console.log(validationResponse.message, validationResponse.valid);

      if (validationResponse.valid) {
        const availableTimes = getAvailableShippingTime(user);

        await bot.sendMessage(
          chatId,
          '📍 **Адрес найден!**\n\nТеперь, пожалуйста, укажите удобное время доставки. ⏰',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [...availableTimes, ['Назад']],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
        await collectionUser.updateOne(
          { userId },
          { $set: { address: text, processType: 'select_time' } }
        );
      } else {
        await bot.sendMessage(
          chatId,
          '❌ **Адрес не найден.**\n\nПожалуйста, попробуйте изменить адрес ',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [['Назад']],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
      }

      // Обновление статуса пользователя в процессе
    } else if (
      (user.processType === 'select_time' && text === '9-11') ||
      (user.processType === 'select_time' && text === '12-14') ||
      (user.processType === 'select_time' && text === '15-17') ||
      (user.processType === 'select_time' && text === '18-20') ||
      (user.processType === 'select_time' &&
        text === '20-21' &&
        user.processType === 'select_time' &&
        text !== 'Назад')
    ) {
      console.log(getAvailableShippingTime(user)[0][0], 'zzzww');

      if (
        getAvailableShippingTime(user)[0][0] === 'К сожалению, на этот день доставка недоступна.'
      ) {
        console.log('can nto');

        return;
      }
      if (user.address === 'Самовывоз') {
        console.log(getAvailableShippingTime(user)[0][0], 'zzw');

        await bot.sendMessage(
          chatId,
          '⏰ **Время доставки выбрано.**\n\nТеперь, пожалуйста, укажите ваш номер телефона. 📞',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [['Назад']],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
        await collectionUser.updateOne(
          { userId },
          { $set: { time: text, processType: 'client_number' } }
        );
        return;
      }

      await bot.sendMessage(
        chatId,
        '⏰ **Время доставки выбрано.**\n\nТеперь, пожалуйста, укажите ваш номер телефона. 📞',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [['Назад']],
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
            processType: 'client_number',
          },
        }
      );
    } else if (user.processType === 'client_number' && text !== 'Назад') {
      const phoneRegex = /^(\+7|8)\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}$/;
      if (!phoneRegex.test(text)) {
        await bot.sendMessage(
          chatId,
          '❌ **Неверный формат номера телефона.**\n\nПожалуйста, проверьте введенные данные и попробуйте еще раз. 📞',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [['Назад']],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
        return;
      }
      if (user.address === 'Самовывоз') {
        await bot.sendMessage(
          chatId,
          '📱 Номер телефона получателя успешно выбран. \n\n💌 Сейчас, при желании, вы можете указать текст для открытки или перейти дальше.',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [['Перейти дальше'], ['Назад']],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
      } else {
        await bot.sendMessage(
          chatId,
          '📱Ваш номер телефона успешно сохранен. \n\nТеперь, укажите кто получит заказ \n1️⃣  Я\n2️⃣ Другой человек\n\n📱 Пожалуйста, выберите один из вариантов. ',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [['Я', 'Другой человек'], ['Назад']],
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
            processType: user.address === 'Самовывоз' ? 'postcard' : 'who_is_client',
          },
        }
      );
    } else if (
      user.processType === 'who_is_client' &&
      text !== 'Назад' &&
      user.address !== 'Самовывоз'
    ) {
      if (text === 'Я' || text === '1') {
        await bot.sendMessage(
          chatId,
          '📱Вы указали себя как получателя. \n\n💌 Сейчас, при желании, вы можете указать текст для открытки или перейти дальше.',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [['Перейти дальше'], ['Назад']],
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
              processType: 'postcard',
            },
          }
        );
      } else if (text === 'Другой человек' || text === '2') {
        await bot.sendMessage(
          chatId,
          '📱Вы указали другого человека как получателя. \n\nУкажите номер телефона этого человека 📞',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [[''], ['Назад']],
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
              processType: 'recipient_number',
            },
          }
        );
      }
    } else if (user.processType === 'recipient_number' && text !== 'Назад') {
      const phoneRegex = /^(\+7|8)\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}$/;
      if (!phoneRegex.test(text)) {
        await bot.sendMessage(
          chatId,
          '❌ **Неверный формат номера телефона.**\n\nПожалуйста, проверьте введенные данные и попробуйте еще раз. 📞',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [['Назад']],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
        return;
      }
      console.log('EXTRA INFORMATION');

      await bot.sendMessage(
        chatId,
        '📱 Номер телефона получателя успешно выбран. \n\n💌 Сейчас, при желании, вы можете указать текст для открытки или перейти дальше.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [['Перейти дальше'], ['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
      await collectionUser.updateOne(
        { userId },
        { $set: { recipientNumber: text, processType: 'postcard' } }
      );
    } else if (user.processType === 'postcard' && text !== 'Назад' && text === 'Перейти дальше') {
      await bot.sendMessage(
        chatId,
        'Сейчас вы можете указать дополнительную информацию или перейти к оплате. ✨',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [['Перейти к оплате'], ['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
      await collectionUser.updateOne(
        { userId },
        { $set: { postcard: null, processType: 'extra_information' } }
      );
    } else if (user.processType === 'postcard' && text !== 'Назад' && text !== 'Перейти дальше') {
      await bot.sendMessage(
        chatId,
        '✨Информация для открытки успешно сохранена. Сейчас вы можете указать дополнительную информацию или перейти к оплате. ✨ ',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [['Перейти к оплате'], ['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
      await collectionUser.updateOne(
        { userId },
        { $set: { postcard: text, processType: 'extra_information' } }
      );
    } else if (
      user.processType === 'extra_information' &&
      text !== 'Назад' &&
      text !== 'Перейти к оплате'
    ) {
      await bot.sendMessage(
        chatId,
        '✨ Дополнительная информация о заказе успешно сохранена. Перейдите к оплате. ✨',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [[' Перейти к оплате'], [' Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
      await collectionUser.updateOne(
        { userId },
        { $set: { extraInformation: text, processType: 'prepare_payment' } }
      );
    } else if (
      user.processType === 'extra_information' &&
      text === 'Перейти к оплате' &&
      text !== 'Назад'
    ) {
      const merchantLogin = 'FloriMondibot';
      const password1 = 'lLj8x1UR4zvz7M7WezHS';
      const invId = Math.floor(100000 + Math.random() * 900000);

      const extraPrice =
        user && (await user.MKAD) === 'Доставка по Москве в пределах МКАД — 750 ₽'
          ? 750
          : user.MKAD === 'Курьер за МКАД- Ближнее Подмосковье — 950 ₽'
          ? 950
          : user.MKAD === 'Курьер за МКАД - область — 2000 ₽'
          ? 2000
          : 0;
      const outSum = (await user.price) + extraPrice;

      const link = await generatePaymentLink(merchantLogin, password1, invId, outSum);

      console.log(link);

      await collectionUser.updateOne({ userId }, { $set: { invId, processType: 'payment' } });
      // Отправка ссылки пользователю
      await bot.sendMessage(
        chatId,
        `💳 *Оплата заказа* 💳\n\n` +
          `📦 Цена товара: *${await user.price}₽*\n` +
          `🚚 Цена доставки: *${extraPrice}₽*\n` +
          `💰 Финальная цена с учетом доставки: *${outSum}₽*\n\n` +
          `[💰 Оплатить заказ](${link})\n\n` + // Скрытая ссылка
          `✅ После успешной оплаты ваш заказ будет обработан автоматически.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
    } else if (
      user.processType === 'prepare_payment' &&
      text === 'Перейти к оплате' &&
      text !== 'Назад'
    ) {
      const merchantLogin = 'FloriMondibot';
      const password1 = 'lLj8x1UR4zvz7M7WezHS';
      const invId = Math.floor(100000 + Math.random() * 900000);

      const extraPrice =
        user && (await user.MKAD) === 'Доставка по Москве в пределах МКАД — 750 ₽'
          ? 750
          : user.MKAD === 'Курьер за МКАД- Ближнее Подмосковье — 950 ₽'
          ? 950
          : user.MKAD === 'Курьер за МКАД - область — 2000 ₽'
          ? 2000
          : 0;
      const outSum = (await user.price) + extraPrice;

      const link = await generatePaymentLink(merchantLogin, password1, invId, outSum);

      console.log(link);

      // Отправка ссылки пользователю
      await bot.sendMessage(
        chatId,
        `💳 *Оплата заказа* 💳\n\n` +
          `📦 Цена товара: *${await user.price}₽*\n` +
          `🚚 Цена доставки: *${extraPrice}₽*\n` +
          `💰 Финальная цена с учетом доставки: *${outSum}₽*\n\n` +
          `[💰 Оплатить заказ](${link})\n\n` + // Скрытая ссылка
          `✅ После успешной оплаты ваш заказ будет обработан автоматически.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
      await collectionUser.updateOne({ userId }, { $set: { invId, processType: 'payment' } });
      return;
    } else if (text !== 'Назад') {
      //   await bot.sendMessage(
      //     chatId,
      //     "К сожалению, я не понимаю эту команду. Выберите действие из предложенных кнопок."
      //   );
    }
  } catch (error) {
    console.error('Ошибка при обработке текстового сообщения:', error);
  }
});

bot.on('message', async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    if (!collectionUser) {
      return;
    }
    const chatType = msg.chat.type; // 'private', 'group', 'supergroup'
    if (chatType === 'supergroup') {
      return; // Игнорируем команды в группе
    }
    const user = await collectionUser.findOne({ userId });
    if (
      user &&
      user.isInProcess &&
      user.processType !== 'about' &&
      user.processType !== 'site' &&
      user.processType !== 'catalog' &&
      user.processType !== 'catalog_price=4000' &&
      user.processType !== 'catalog_price=8000' &&
      user.processType !== 'catalog_price=15000' &&
      user.processType !== 'map'
    ) {
      return;
    } else if (text === 'О нас') {
      await collectionUser.updateOne(
        { userId },
        { $set: { isInProcess: true, processType: 'about' } }
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
          keyboard: [['Назад']],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    } else if (text === 'Наш сайт') {
      await collectionUser.updateOne(
        { userId },
        { $set: { isInProcess: true, processType: 'site' } }
      );

      await bot.sendMessage(chatId, 'www.florimondi.ru/about/', {
        reply_markup: {
          keyboard: [['Назад']],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    } else if (text === 'Наш каталог') {
      const slidesFor4k = await collectionCategory.findOne({ 'categoryInfo.id': '1' });
      const slidesFor4k = await collectionCategory.findOne({ 'categoryInfo.id': '1' });
      const slidesFor4k = await collectionCategory.findOne({ 'categoryInfo.id': '1' });

      await collectionUser.updateOne(
        { userId },
        { $set: { isInProcess: true, processType: 'catalog' } }
      );

      await bot.sendMessage(chatId, 'Выберете интересующий вас каталог ', {
        reply_markup: {
          keyboard: [
            [slidesFor4k.categoryInfo.name, 'Корзины'],
            ['Раскидистые букеты', 'Коробки'],
            ['Назад'],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    } else if (text === 'Мы на карте') {
      await collectionUser.updateOne(
        { userId },
        { $set: { isInProcess: true, processType: 'map' } }
      );
      await bot.sendLocation(chatId, 55.743139, 37.633583);
      await bot.sendMessage(chatId, 'Москва, Руновский переулок 8, строение 1', {
        reply_markup: {
          keyboard: [['Назад']],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    }
    const isFirst = await collectionCategory.findOne({
      'categoryInfo.id': '1',
      'categoryInfo.name': text,
    });

    const isSecond = await collectionCategory.findOne({
      'categoryInfo.id': '2',
      'categoryInfo.name': text,
    });
    const isThird = await collectionCategory.findOne({
      'categoryInfo.id': '3',
      'categoryInfo.name': text,
    });

    if (
      isFirst !== null ||
      (isFirst !== undefined && undefined && user.processType === 'catalog')
    ) {
      await collectionUser.updateOne(
        { userId },
        { $set: { isInProcess: true, processType: 'catalog_price=4000' } }
      );

      await bot.sendMessage(chatId, `Вы выбрали каталог: ${isFirst.categoryInfo.name}`, {
        reply_markup: {
          keyboard: [['Назад']],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });

      // Отправка каталога
      async function sendCatalog() {
        const slidesFor4k = await collectionCategory.findOne({ 'categoryInfo.id': '1' });
        console.log(slidesFor4k, '1');

        await slidesFor4k.categoryItem.forEach(async (item, index) => {
          const sentMessage = await bot.sendPhoto(chatId, item.photo, {
            caption: item.caption,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🛒 Купить',
                    callback_data: `vitrina_4k_${item.itemId}`,
                  },
                ],
              ],
            },
          });
          await collectionUser.updateOne(
            { userId },
            { $push: { photo_to_delete: sentMessage.message_id } }
          );
        });
      }

      await sendCatalog();
    }
    if (isSecond !== null && isSecond !== undefined && user.processType === 'catalog') {
      await collectionUser.updateOne(
        { userId },
        { $set: { isInProcess: true, processType: 'catalog_price=8000' } }
      );
      await bot.sendMessage(chatId, `Вы выбрали каталог: ${isSecond.categoryInfo.name}`, {
        reply_markup: {
          keyboard: [['Назад']],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      async function sendCatalog() {
        const slidesFor7k = await collectionCategory.findOne({ 'categoryInfo.id': '2' });
        slidesFor7k.categoryItem.forEach(async (item, index) => {
          const sentMessage = await bot.sendPhoto(chatId, item.photo, {
            caption: item.caption,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🛒 Купить',
                    callback_data: `vitrina_7k_${item.itemId}`,
                  },
                ],
              ],
            },
          });
          await collectionUser.updateOne(
            { userId },
            { $push: { photo_to_delete: sentMessage.message_id } }
          );
        });
      }

      await sendCatalog();
    }
    if (isThird !== null && isThird !== undefined && user.processType === 'catalog') {
      await collectionUser.updateOne(
        { userId },
        { $set: { isInProcess: true, processType: 'catalog_price=10000' } }
      );
      await bot.sendMessage(chatId, `Вы выбрали каталог: ${isThird.categoryInfo.name}`, {
        reply_markup: {
          keyboard: [['Назад']],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      async function sendCatalog() {
        const slidesFor10k = await collectionCategory.findOne({ 'categoryInfo.id': '3' });
        slidesFor10k.categoryItem.forEach(async (item, index) => {
          const sentMessage = await bot.sendPhoto(chatId, item.photo, {
            caption: item.caption,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🛒 Купить',
                    callback_data: `vitrina_10k_${item.itemId}`,
                  },
                ],
              ],
            },
          });
          await collectionUser.updateOne(
            { userId },
            { $push: { photo_to_delete: sentMessage.message_id } }
          );
        });
      }
      await sendCatalog();
    } else if (text === 'Раскидистые букеты' && user.processType === 'catalog') {
      await collectionUser.updateOne(
        { userId },
        { $set: { isInProcess: true, processType: 'catalog_price=10000++' } }
      );
      await bot.sendMessage(chatId, 'Вы выбрали каталог: Раскидистые букеты', {
        reply_markup: {
          keyboard: [['Назад']],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      async function sendCatalog() {
        slidesFor10moreK.forEach(async (item, index) => {
          const sentMessage = await bot.sendPhoto(chatId, item.photo, {
            caption: item.caption,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🛒 Купить',
                    callback_data: `vitrina_14k_${index}`,
                  },
                ],
              ],
            },
          });
          await collectionUser.updateOne(
            { userId },
            { $push: { photo_to_delete: sentMessage.message_id } }
          );
        });
      }
      await sendCatalog();
    }
  } catch (error) {
    console.error('Ошибка при обработке текстового сообщения:', error);
  }
});

// Обработка кнопки выбора даты

// Функция для создания календаря

bot.on('callback_query', async (query) => {
  try {
    if (!collectionUser) {
      return;
    }
    const user = await collectionUser.findOne({ userId: query.from.id });
    if (!user) {
      return;
    }
    const chatId = query.message.chat.id;
    const callback_data = query.data;
    if (callback_data === 'nextt_product_10') {
      const products = await collectionProduct.find({ photo: { $exists: true } }).toArray();
      const count = products.length;

      if (user.photo_to_delete) {
        console.log('удаление на заходе 2');

        await user.photo_to_delete.forEach(async (photoId) => {
          await bot.deleteMessage(chatId, photoId);
        });
      }

      if (Array.isArray(user.message_to_delete) && user.message_to_delete.length > 0) {
        for (const messageId of user.message_to_delete) {
          try {
            await bot.deleteMessage(chatId, messageId);
          } catch (error) {
            console.error(`Ошибка при удалении сообщения2 ${messageId}:`, error.message);
          }
        }
      } else if (typeof user.message_to_delete === 'number') {
        try {
          await bot.deleteMessage(chatId, user.message_to_delete);
        } catch (error) {
          console.error(`Ошибка при удалении сообщения2 ${user.message_to_delete}:`, error.message);
        }
      }

      await collectionUser.updateOne(
        { userId: query.from.id },
        { $set: { message_to_delete: [] } }
      );
      // Слайд 10-20 товаров
      const mediaGroup = await products
        .filter((product) => product.photo)
        .map((product, index) => ({
          type: 'photo',
          media: product.photo,
          caption: `№${index + 11}: ${product.price || 'Без цены'} ₽`,
        }))
        .slice(10, 20);
      const keyboardText = await products
        .slice(10, 20)
        .map((product, index) => [
          `№${index + 11} ${product.price ? `${product.price} ₽` : 'Без цены'}`,
        ]);
      keyboardText.push(['Назад']);
      const messagePhotos = await bot.sendMediaGroup(chatId, mediaGroup);
      const messagePhotoId = messagePhotos.map((item) => item.message_id);

      const keyboard = [
        {
          text: 'Предыдущий слайд',
          callback_data: 'back_from_showcase',
        },
        {
          text: 'Смотреть дальше',
          callback_data: 'nextt_product_20',
        },
      ];
      const keyboard2 = [
        {
          text: 'Предыдущий слайд',
          callback_data: 'back_from_showcase',
        },
      ];
      const messagesId = [];
      const messageWelcome = await bot.sendMessage(chatId, 'Вы перешли на второй слайд.', {
        reply_markup: {
          keyboard: keyboardText,
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      messagesId.push(messageWelcome.message_id);
      if (count >= 21) {
        const messageWelcome2 = await bot.sendMessage(
          chatId,
          'Выберите товар или перейдите к следующему слайду:',
          {
            reply_markup: {
              inline_keyboard: [keyboard],
            },
          }
        );
        messagesId.push(messageWelcome2.message_id);
      }

      if (count < 21) {
        const messageWelcome2 = await bot.sendMessage(
          chatId,
          'Выберите товар или перейдите к предыдущему слайду:',
          {
            reply_markup: {
              inline_keyboard: [keyboard2],
            },
          }
        );
        messagesId.push(messageWelcome2.message_id);
      }

      await collectionUser.updateOne(
        { userId: chatId },
        {
          $set: {
            currentShow: 2,
            photo_to_delete: messagePhotoId,
            message_to_delete: messagesId,
          },
        }
      );
      return;
    }
    if (callback_data === 'nextt_product_20') {
      if (user.photo_to_delete) {
        await user.photo_to_delete.forEach(async (photoId) => {
          await bot.deleteMessage(chatId, photoId);
          await collectionUser.updateOne({ userId: chatId }, { $set: { photo_to_delete: [] } });
        });
      }
      const products = await collectionProduct.find({ photo: { $exists: true } }).toArray();

      if (!user.message_to_delete) {
        console.log('message_to_delete не определен');
        return;
      }
      if (Array.isArray(user.message_to_delete) && user.message_to_delete.length > 0) {
        for (const messageId of user.message_to_delete) {
          try {
            await bot.deleteMessage(chatId, messageId);
          } catch (error) {
            console.error(`Ошибка при удалении сообщения ${messageId}:`, error.message);
          }
        }
      } else if (typeof user.message_to_delete === 'number') {
        try {
          await bot.deleteMessage(chatId, user.message_to_delete);
        } catch (error) {
          console.error(`Ошибка при удалении сообщения ${user.message_to_delete}:`, error.message);
        }
      }

      const keyboard = [
        {
          text: 'Предыдущий слайд',
          callback_data: 'back_from_showcase',
        },
      ];

      await collectionUser.updateOne(
        { userId: chatId },
        {
          $set: {
            currentShow: 3,
            message_to_delete: [],
          },
        }
      );
      // Слайд 10-20 товаров
      const mediaGroup = await products
        .filter((product) => product.photo)
        .map((product, index) => ({
          type: 'photo',
          media: product.photo,
          caption: `№${index + 11}: ${product.price || 'Без цены'} ₽`,
        }))
        .slice(20, 30);
      const keyboardText = await products
        .slice(20, 30)
        .map((product, index) => [
          `№${index + 21} ${product.price ? `${product.price} ₽` : 'Без цены'}`,
        ]);
      keyboardText.push(['Назад']);

      const messagePhotos = await bot.sendMediaGroup(chatId, mediaGroup);
      const messageWelcome1 = await bot.sendMessage(chatId, 'Вы перешли на третий слайд.', {
        reply_markup: {
          keyboard: keyboardText,
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      const messageWelcome2 = await bot.sendMessage(chatId, 'Выберите товар или вернитесь назад:', {
        reply_markup: {
          inline_keyboard: [keyboard],
        },
      });

      setTimeout(() => {
        collectionUser.updateOne(
          { userId: query.from.id },
          {
            $push: {
              photo_to_delete: {
                $each: messagePhotos.map((item) => item.message_id),
              },
            },
          }
        );
      }, 1000);

      const messagesId = [messageWelcome1.message_id, messageWelcome2.message_id];
      await collectionUser.updateOne(
        { userId: chatId },
        {
          $set: {
            message_to_delete: messagesId,
          },
        }
      );
      return;
    }
    if (callback_data === 'back_from_showcase') {
      if (user.currentShow === 2) {
        await collectionUser.updateOne(
          { userId: chatId },
          {
            $set: {
              currentShow: 1,
            },
          }
        );
        if (user.message_to_delete) {
          await user.message_to_delete.forEach(async (messageId) => {
            await bot.deleteMessage(chatId, messageId);
          });
        }

        if (user.photo_to_delete) {
          await user.photo_to_delete.forEach(async (photoId) => {
            await bot.deleteMessage(chatId, photoId);
            await collectionUser.updateOne({ userId: chatId }, { $set: { photo_to_delete: [] } });
          });
        }
        await collectionUser.updateOne(
          { userId: chatId },
          {
            $set: {
              message_to_delete: [],
            },
          }
        );
        const products = await collectionProduct.find({ photo: { $exists: true } }).toArray();

        if (products.length === 0) {
          await bot.sendMessage(chatId, 'Нет фото для отображения.');
          return;
        }

        const mediaGroup = products
          .filter((product) => product.photo)
          .map((product, index) => ({
            type: 'photo',
            media: product.photo,
            caption: `№${index + 1}: ${product.price || 'Без цены'} ₽`,
          }))
          .slice(0, 10);

        const messagePhotos = await bot.sendMediaGroup(chatId, mediaGroup);
        const messagePhotoId = messagePhotos.map((item) => item.message_id);
        console.log('messagePhotoId', messagePhotoId);

        await collectionUser.updateOne(
          { userId: chatId },
          {
            $set: {
              processType: 'showcase',
            },
          }
        );

        const keyboard = [
          {
            text: 'Смотреть дальше',
            callback_data: 'nextt_product_10',
          },
        ];
        const keyboardText = products
          .slice(0, 10)
          .map((product, index) => [
            `№${index + 1} ${product.price ? `${product.price} ₽` : 'Без цены'}`,
          ]);
        keyboardText.push(['Назад']);
        const messageWelcome1 = await bot.sendMessage(chatId, 'Вы перешли на первый слайд.', {
          reply_markup: {
            keyboard: keyboardText,
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        const messageWelcome2 = await bot.sendMessage(
          chatId,
          'Выберите товар или перейдите к следующему слайду:',
          {
            reply_markup: {
              inline_keyboard: [keyboard],
            },
          }
        );
        const messagesId = [messageWelcome1.message_id, messageWelcome2.message_id];
        await collectionUser.updateOne(
          { userId: chatId },
          {
            $set: {
              message_to_delete: messagesId,
              photo_to_delete: messagePhotoId,
            },
          }
        );
        return;
      }
      if (user.currentShow === 3) {
        await collectionUser.updateOne(
          { userId: chatId },
          {
            $set: {
              currentShow: 2,
            },
          }
        );
        if (user.photo_to_delete) {
          await user.photo_to_delete.forEach(async (photoId) => {
            await bot.deleteMessage(chatId, photoId);
            await collectionUser.updateOne({ userId: chatId }, { $set: { photo_to_delete: [] } });
          });
        }
        if (user.message_to_delete) {
          await user.message_to_delete.forEach(async (messageId) => {
            await bot.deleteMessage(chatId, messageId);
          });
        }

        await collectionUser.updateOne(
          { userId: chatId },
          {
            $set: {
              message_to_delete: [],
            },
          }
        );
        const products = await collectionProduct.find({ photo: { $exists: true } }).toArray();

        if (products.length === 0) {
          await bot.sendMessage(chatId, 'Нет фото для отображения.');
          return;
        }

        const mediaGroup = await products
          .filter((product) => product.photo)
          .map((product, index) => ({
            type: 'photo',
            media: product.photo,
            caption: `№${index + 11}: ${product.price || 'Без цены'} ₽`,
          }))
          .slice(10, 20);

        const messagePhotos = await bot.sendMediaGroup(chatId, mediaGroup);
        console.log(
          'messagePhotos',
          messagePhotos.map((item) => item.message_id)
        );
        const photoIds = messagePhotos.map((item) => item.message_id);
        await collectionUser.updateOne(
          { userId: chatId },
          {
            $set: {
              processType: 'showcase',
            },
            $push: {
              photo_to_delete: { $each: photoIds },
            },
          }
        );

        const keyboard = [
          {
            text: 'Предыдущий слайд',
            callback_data: 'back_from_showcase',
          },
          {
            text: 'Смотреть дальше',
            callback_data: 'nextt_product_10',
          },
        ];
        const keyboardText = await products
          .slice(10, 20)
          .map((product, index) => [
            `№${index + 11} ${product.price ? `${product.price} ₽` : 'Без цены'}`,
          ]);
        keyboardText.push(['Назад']);
        const messageWelcome1 = await bot.sendMessage(chatId, 'Вы перешли на второй слайд.', {
          reply_markup: {
            keyboard: keyboardText,
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        const messageWelcome2 = await bot.sendMessage(
          chatId,
          'Выберите товар или перейдите к следующему слайду:',
          {
            reply_markup: {
              inline_keyboard: [keyboard],
            },
          }
        );
        const messagesId = [messageWelcome1.message_id, messageWelcome2.message_id];
        await collectionUser.updateOne(
          { userId: chatId },
          {
            $set: {
              message_to_delete: messagesId,
            },
          }
        );
        return;
      }
    }
    console.log('callback_data', callback_data);

    if (
      callback_data.startsWith('date_') ||
      callback_data.startsWith('prev_') ||
      callback_data.startsWith('next_') ||
      callback_data === 'ignore'
    ) {
      if (callback_data.startsWith('date_')) {
        const rawDate = callback_data.split('_')[1]; // "2025-02-06"

        // Разбиваем на год, месяц, день
        const [year, month, day] = rawDate.split('-');

        // Форматируем в DD.MM.YYYY
        const formattedMonth = String(month).padStart(2, '0');
        const formattedDay = String(day).padStart(2, '0');
        console.log(formattedDay, formattedMonth, year);

        const formattedDate = `${formattedDay}.${formattedMonth}.${year}`;
        await bot.sendMessage(
          chatId,
          `Вы выбрали дату: *${formattedDate}*. Теперь укажите адрес доставки. Вы можете ввести его следующим образом:\n\n` +
            `1️⃣ *Ввести адрес:* Введите ваш адрес в формате: *Город, Улица, Дом* (например: Москва, Тверская улица, 7). \n\n` +
            `ℹ️ *Обратите внимание:* Мы осуществляем доставку только в Москве и Московской области.\n\n` +
            `2️⃣ *Самовывоз*: Вы можете забрать товар самостоятельно с нашего магазина по адресу Москва, Руновский переулок 8, строение 1.\n` +
            `Для выбора этой опции нажмите "Самовывоз", и вы сможете выбрать удобное время для самовывоза.\n\n`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [['Ввести адрес', 'Самовывоз'], ['Назад']],
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
              processType: 'prepare_address',
              message_to_delete: null,
            },
          }
        );
      } else if (callback_data.startsWith('prev_') || callback_data.startsWith('next_')) {
        const [action, year, month] = callback_data.split('_');
        let newYear = parseInt(year);
        let newMonth = parseInt(month);

        if (action === 'prev') {
          newMonth -= 1;
          if (newMonth < 0) {
            newMonth = 11;
            newYear -= 1;
          }
        } else if (action === 'next') {
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
        await collectionUser.updateOne(
          { userId: chatId },
          {
            $set: {
              message_to_delete: query.message.message_id,
            },
          }
        );
      } else if (callback_data === 'ignore') {
        bot.answerCallbackQuery(query.id, {
          text: 'Эта дата недоступна для выбора.',
        });
      }

      // Отправляем запрос на ввод адреса
    }

    //VITRINAA
    const vitrinaData = parseCallbackData(callback_data);

    if (!vitrinaData) return;
    if (vitrinaData.price === '4') {
      const selectedProduct = await collectionCategory.findOne({
        'categoryInfo.id': '1',
        'categoryItem.itemId': vitrinaData.id,
      });

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      const calendar = generateCalendar(year, month);

      const price = await selectedProduct.categoryItem
        .find((el) => el.itemId === vitrinaData.id)
        .caption.match(/Цена:\s*(.+)/);
      const photo = await selectedProduct.categoryItem.find((el) => el.itemId === vitrinaData.id)
        .photo;
      const numericPrice = await parseInt(price[1].replace(/\s|₽/g, ''), 10);
      if (user.message_to_delete) {
        await bot.deleteMessage(chatId, user.message_to_delete);
      }
      const sentMessage = await bot.sendMessage(
        chatId,
        '📅Пожалуйста, выберите удобную вам дату:',
        {
          reply_markup: {
            inline_keyboard: calendar,
          },
        }
      );
      await collectionUser.updateOne(
        { userId: chatId },
        {
          $set: {
            isInProcess: true,
            processType: 'select_date',
            photo: photo,
            message_to_delete: sentMessage.message_id,
            price: numericPrice,
          },
        }
      );
    } else if (vitrinaData.price === '7') {
      const selectedProduct = await collectionCategory.findOne({
        'categoryInfo.id': '2',
        'categoryItem.itemId': vitrinaData.id,
      });

      console.log('vitrunamId', vitrinaData.id);

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      const calendar = generateCalendar(year, month);

      const price = await selectedProduct.categoryItem
        .find((el) => el.itemId === vitrinaData.id)
        .caption.match(/Цена:\s*(.+)/);
      const numericPrice = await parseInt(price[1].replace(/\s|₽/g, ''), 10);

      const photo = await selectedProduct.categoryItem.find((el) => el.itemId === vitrinaData.id)
        .photo;

      if (user.message_to_delete) {
        await bot.deleteMessage(chatId, user.message_to_delete);
      }
      const sentMessage = await bot.sendMessage(
        chatId,
        '📅Пожалуйста, выберите удобную вам дату:',
        {
          reply_markup: {
            inline_keyboard: calendar,
          },
        }
      );
      console.log('finally price,', numericPrice);

      await collectionUser.updateOne(
        { userId: chatId },
        {
          $set: {
            isInProcess: true,
            processType: 'select_date',
            photo: photo,
            message_to_delete: sentMessage.message_id,
            price: numericPrice,
          },
        }
      );
      console.log('selectedProduct', selectedProduct);
    } else if (vitrinaData.price === '10') {
      const selectedProduct = await collectionCategory.findOne({
        'categoryInfo.id': '3',
        'categoryItem.itemId': vitrinaData.id,
      });

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      const calendar = generateCalendar(year, month);

      const price = await selectedProduct.categoryItem
        .find((el) => el.itemId === vitrinaData.id)
        .caption.match(/Цена:\s*(.+)/);
      const numericPrice = await parseInt(price[1].replace(/\s|₽/g, ''), 10);
      const photo = await selectedProduct.categoryItem.find((el) => el.itemId === vitrinaData.id)
        .photo;
      console.log('selectedProduct', selectedProduct);
      if (user.message_to_delete) {
        await bot.deleteMessage(chatId, user.message_to_delete);
      }

      const sentMessage = await bot.sendMessage(
        chatId,
        '📅Пожалуйста, выберите удобную вам дату:',
        {
          reply_markup: {
            inline_keyboard: calendar,
          },
        }
      );
      await collectionUser.updateOne(
        { userId: chatId },
        {
          $set: {
            isInProcess: true,
            processType: 'select_date',
            photo: photo,
            message_to_delete: sentMessage.message_id,
            price: numericPrice,
          },
        }
      );
      console.log('selectedProduct', selectedProduct);
    } else if (vitrinaData.price === '14') {
      const selectedProduct = slidesFor10moreK[vitrinaData.lastNum];
      console.log('selectedProduct', selectedProduct);
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      const calendar = generateCalendar(year, month);

      const price = selectedProduct.caption.match(/Цена:\s*(.+)/);
      console.log('selectedProduct', selectedProduct);
      const numericPrice = await parseInt(price[1].replace(/\s|₽/g, ''), 10);
      if (user.message_to_delete) {
        await bot.deleteMessage(chatId, user.message_to_delete);
      }

      const sentMessage = await bot.sendMessage(
        chatId,
        '📅Пожалуйста, выберите удобную вам дату:',
        {
          reply_markup: {
            inline_keyboard: calendar,
          },
        }
      );
      await collectionUser.updateOne(
        { userId: chatId },
        {
          $set: {
            isInProcess: true,
            processType: 'select_date',
            photo: selectedProduct.photo,
            message_to_delete: sentMessage.message_id,
            price: numericPrice,
          },
        }
      );
    }
  } catch (e) {
    console.log(e);
  }
});

const slidesFor10moreK = [
  {
    photo:
      'https://florimondi.ru/upload/resize_cache/webp/iblock/7fe/y5oxh2n0nw3ifo85d6flb3onevhzt15v.webp',
    caption: '🌸 Монобукет из кустовой пионовидной розы и веточек эвкалипта \n💰 Цена: 3 990 ₽',
  },
  {
    photo:
      'https://florimondi.ru/upload/resize_cache/webp/iblock/718/leokgv9ajcxhppm6rbp54zy8k1ebko96.webp',
    caption: '💐 Букет с розой Вайт О\'Хара "Замечательный" \n💰 Цена: 4 290 ₽',
  },
  {
    photo:
      'https://florimondi.ru/upload/resize_cache/webp/iblock/706/m1wnj9peusz3ji4hlwe8hjl79igblbzv.webp',
    caption: '🎁 Авторский букет из садовой розы и нарциссов "Диковинный". \n💰 Цена: 4 590 ₽',
  },
  {
    photo:
      'https://florimondi.ru/upload/resize_cache/webp/iblock/fa6/x1c95xh7fbaysgmnxo0v7usmusenv6km.webp',
    caption: '🎁 Раскидистый букет с лизиантусом и кустовой пионовидной розой. \n💰 Цена: 4 990 ₽',
  },
];
function parseCallbackData(callbackData) {
  const match = callbackData.match(/^vitrina_(\d+)\+?k_(\d+)$/);
  if (!match) return null;

  const price = match[1]; // Значение между vitrina_ и _k
  const id = match[2]; // Последнее число

  return { price, id };
}

app.listen(3003, () => {
  console.log(`Сервер запущен на http://localhost:${3000}`);
});
