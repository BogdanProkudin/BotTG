import ItemModel from "./db.schema.js";
import { Markup } from "telegraf";
import connectToDatabase from "./db.js";

const db = await connectToDatabase();

export async function addShowcaseItem(bot, msg) {
  let itemData = {
    photo: null,
    price: null,
  };
  console.log("addShowcaseItem");

  try {
    const db = await connectToDatabase();
    const collectionProduct = db.collection("db1");
    const collectionUser = db.collection("dbUser");

    const chatId = msg.chat.id;
    const currentUser = await collectionUser.findOne({ userId: chatId });

    if (
      currentUser &&
      (currentUser.proccesName === "addShowcaseItem" ||
        currentUser.proccesName === "editShowcaseItem")
    ) {
      bot.sendMessage(chatId, "Вы уже в процессе добавления предмета.");
      return;
    }

    if (currentUser?.isUserAddedItem) {
      bot.sendMessage(
        chatId,
        "Вы уже добавили предмет! Используйте команду 'Добавить', чтобы добавить еще один."
      );
      return;
    }

    if (currentUser?.isUserSentPhoto) {
      bot.sendMessage(chatId, "Вы уже отправили фото. Теперь отправьте цену.");
      return;
    }

    await collectionUser.updateOne(
      { userId: chatId },
      { $set: { proccesName: "addShowcaseItem", isUserSentPhoto: false } },
      { upsert: true }
    );

    bot.sendMessage(chatId, "Отправьте фото предмета.", {
      reply_markup: {
        keyboard: [["Назад"]],
        resize_keyboard: true,
      },
    });

    bot.once("photo", async (msg) => {
      const photo = msg.photo.pop();
      itemData.photo = photo.file_id;

      const collectionUser = db.collection("dbUser");
      await collectionUser.updateOne(
        { userId: chatId },
        { $set: { isUserSentPhoto: true } }
      );

      bot.sendMessage(
        chatId,
        "Фото сохранено! Теперь отправьте цену предмета."
      );
    });
    if (collectionUser && collectionUser.isUserSentPhoto) {
      bot.once("message", async (msg) => {
        const price = parseFloat(msg.text);

        if (isNaN(price) || price <= 0) {
          bot.sendMessage(chatId, "Некорректная цена. Попробуйте снова.");
          return;
        }

        itemData.price = price;

        try {
          await collectionProduct.insertOne({
            photo: itemData.photo,
            price: itemData.price,
          });

          bot.sendMessage(chatId, "Предмет успешно сохранен!", {
            reply_markup: {
              keyboard: [["Добавить еще"], ["Назад"]],
              resize_keyboard: true,
            },
          });

          await collectionUser.updateOne(
            { userId: chatId },
            { $set: { proccesName: null, isUserAddedItem: true } }
          );

          itemData = { photo: null, price: null };
        } catch (error) {
          console.error(error);
          bot.sendMessage(
            chatId,
            "Ошибка при сохранении. Попробуйте снова позже."
          );
        }
      });
    }
  } catch (error) {
    console.error(error);
    bot.sendMessage(msg.chat.id, "Произошла ошибка. Попробуйте снова.");
  }
}
export async function editShowcaseItem(bot, msg) {
  const chatId = msg.chat.id;
  const db = await connectToDatabase();
  const collectionUser = db.collection("dbUser");
  const collectionProduct = db.collection("db1");

  let itemData = {
    index: null,
    photo: null,
    price: null,
  };

  await collectionUser.updateOne(
    { userId: chatId },
    { $set: { step: "getIndex", proccesName: "editShowcaseItem" } },
    { upsert: true }
  );

  bot.sendMessage(chatId, "Введите номер предмета для редактирования.", {
    reply_markup: {
      keyboard: [["Назад"]],
      resize_keyboard: true,
    },
  });

  bot.once("message", async (msg) => {
    const index = parseInt(msg.text);

    if (isNaN(index) || index < 0) {
      bot.sendMessage(chatId, "Некорректный номер. Попробуйте снова.");
      return;
    }

    const cursor = collectionProduct.find().skip(index).limit(1);
    const document = await cursor.next();

    if (!document) {
      bot.sendMessage(chatId, "Предмет с таким номером не найден.");
      return;
    }

    itemData.index = index;

    await collectionUser.updateOne(
      { userId: chatId },
      { $set: { step: "getPhoto" } }
    );

    bot.sendMessage(chatId, "Отправьте новое фото предмета.");
  });

  bot.on("photo", async (msg) => {
    const photo = msg.photo.pop();
    itemData.photo = photo.file_id;

    await collectionUser.updateOne(
      { userId: chatId },
      { $set: { step: "getPrice" } }
    );

    bot.sendMessage(chatId, "Фото сохранено! Теперь отправьте новую цену.");
  });

  bot.on("message", async (msg) => {
    const userState = await collectionUser.findOne({ userId: chatId });

    if (userState.step === "getPrice") {
      const price = parseFloat(msg.text);

      if (isNaN(price) || price <= 0) {
        bot.sendMessage(chatId, "Некорректная цена. Попробуйте снова.");
        return;
      }

      itemData.price = price;

      const cursor = collectionProduct.find().skip(itemData.index).limit(1);
      const document = await cursor.next();

      if (document) {
        await collectionProduct.updateOne(
          { _id: document._id },
          { $set: { photo: itemData.photo, price: itemData.price } }
        );

        bot.sendMessage(chatId, "Предмет успешно отредактирован!", {
          reply_markup: {
            keyboard: [["Отредактировать еще"], ["Назад"]],
            resize_keyboard: true,
          },
        });
      } else {
        bot.sendMessage(chatId, "Ошибка: предмет не найден.");
      }

      await collectionUser.updateOne(
        { userId: chatId },
        { $set: { step: null, proccesName: null } }
      );
    }
  });
}

export default async function showcase(ctx) {
  const db = await connectToDatabase();
  const collection = await db.collection("db1");
  const images = await collection.find({ photo: { $exists: true } }).toArray();
  console.log(images);

  await ctx.reply("Онлайн-витрина: ...");

  await ctx.replyWithMediaGroup(
    images.map((image) => ({
      type: "photo",
      media: image.photo,
    }))
  );
}
