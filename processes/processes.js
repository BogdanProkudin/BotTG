export async function startAddProcess(userId, collectionUser) {
  const user = await collectionUser.findOne({ userId });

  if (user && user.isInProcess) {
    return "Вы уже находитесь в процессе добавления товара. Пожалуйста, завершите текущий процесс или отмените его.";
  }

  await collectionUser.updateOne(
    { userId },
    { $set: { isInProcess: true, step: "getPhoto", processType: "add" } },
    { upsert: true }
  );
  return "Отправьте фото товара для добавления.";
}

// Функция начала процесса редактирования
export async function startEditProcess(userId, collectionUser) {
  const user = await collectionUser.findOne({ userId });
  if (user && user.isInProcess) {
    return "Вы уже находитесь в процессе редактирования товара. Пожалуйста, завершите текущий процесс или отмените его.";
  }

  await collectionUser.updateOne(
    { userId },
    { $set: { isInProcess: true, step: "getIndex", processType: "edit" } },
    { upsert: true }
  );
  return "Введите порядковый номер товара, который хотите отредактировать.";
}
export async function deleteProduct(userId, collectionUser) {
  const user = await collectionUser.findOne({ userId });
  if (user && user.isInProcess) {
    return "Вы уже находитесь в процессе редактирования товара. Пожалуйста, завершите текущий процесс или отмените его.";
  }

  await collectionUser.updateOne(
    { userId },
    { $set: { isInProcess: true, step: "getIndex", processType: "delete" } },
    { upsert: true }
  );
  return "Введите порядковый номер товара, который хотите удалить.";
}

// Функция отмены процесса
export async function cancelProcess(userId, collectionUser) {
  const user = await collectionUser.findOne({ userId });
  if (
    (user && user.processType === "catalog_price=4000") ||
    (user && user.processType === "catalog_price=8000") ||
    (user && user.processType === "catalog_price=10000") ||
    (user && user.processType === "catalog_price=10000++")
  ) {
    await collectionUser.updateOne(
      { userId },
      {
        $set: {
          processType: "catalog",
        },
      }
    );
    return "Вы вернулись в процесс выбора интересующего вас каталога.";
  }
  if (user && user.processType === "payment") {
    await collectionUser.updateOne(
      { userId },
      {
        $set: {
          processType: "extra_information",
          extraInformation: null,
        },
      }
    );
    return "Вы вернулись в процесс ввода дополнительной информации.";
  }
  if (user && user.processType === "prepare_payment") {
    await collectionUser.updateOne(
      { userId },
      {
        $set: {
          processType: "extra_information",
          extraInformation: null,
        },
      }
    );
    return "Вы вернулись в процесс ввода дополнительной информации.";
  }

  if (
    user &&
    user.processType === "who_is_client" &&
    user.address !== "Самовывоз"
  ) {
    await collectionUser.updateOne(
      { userId },
      {
        $set: {
          processType: "client_number",
          clientNumber: null,
        },
      }
    );
    return "Вы вернулись в процесс ввода вашего номера телефона.";
  }
  if (user && user.processType === "postcard" && user.address === "Самовывоз") {
    await collectionUser.updateOne(
      { userId },
      {
        $set: {
          processType: "client_number",
          clientNumber: null,
        },
      }
    );
    return "Вы вернулись в процесс ввода вашего номера телефона.";
  }
  if (user && user.processType === "postcard" && user.address !== "Самовывоз") {
    if (user.whoIsClient === "Я" || user.whoIsClient === "1") {
      await collectionUser.updateOne(
        { userId },
        {
          $set: {
            processType: "who_is_client",
            whoIsClient: null,
          },
        }
      );
      return "Вы вернулись в процесс указания кто получит товар.";
    } else if (
      user.whoIsClient === "Другой человек" ||
      user.whoIsClient === "2"
    ) {
      await collectionUser.updateOne(
        { userId },
        {
          $set: {
            processType: "recipient_number",
            recipientNumber: null,
          },
        }
      );
    }

    return "Вы вернулись в процесс указания номера телефона получателя.";
  }
  if (
    user &&
    user.processType === "extra_information" &&
    user.address !== "Самовывоз"
  ) {
    if (user.whoIsClient === "Я" || user.whoIsClient === "1") {
      await collectionUser.updateOne(
        { userId },
        {
          $set: {
            processType: "postcard",
            postcard: null,
          },
        }
      );
      return "Вы вернулись в процесс указания текста для открытки💌.";
    } else if (
      user.whoIsClient === "Другой человек" ||
      user.whoIsClient === "2"
    ) {
      await collectionUser.updateOne(
        { userId },
        {
          $set: {
            processType: "postcard",
            postcard: null,
          },
        }
      );
    }

    return "Вы вернулись в процесс указания текста для открытки💌.";
  }
  if (
    user &&
    user.address === "Самовывоз" &&
    user.processType === "extra_information"
  ) {
    await collectionUser.updateOne(
      { userId },
      {
        $set: {
          processType: "postcard",
          postcard: null,
        },
      }
    );
    return "Вы вернулись в процесс указания текста для открытки💌.";
  }
  if (user && user.processType === "client_number") {
    await collectionUser.updateOne(
      { userId },
      {
        $set: {
          processType: "select_time",
          clientNumber: null,
        },
      }
    );
    return "Вы вернулись в процесс выбора удобного для вас времени.";
  }
  if (
    user &&
    user.processType === "recipient_number" &&
    (user.whoIsClient === "Другой человек" || user.whoIsClient === "2")
  ) {
    await collectionUser.updateOne(
      { userId },
      {
        $set: {
          processType: "who_is_client",
          whoIsClient: null,
        },
      }
    );
    return "Вы вернулись в процесс выбора получателя.";
  }
  if (user && user.processType === "recipient_number") {
    await collectionUser.updateOne(
      { userId },
      {
        $set: {
          processType: "select_time",
          time: null,
        },
      }
    );
    return "Вы вернулись в процесс выбора времени.";
  }
  if (
    (user && user.processType === "send_location") ||
    user.processType === "enter_address" ||
    user.processType === "select_time"
  ) {
    await collectionUser.updateOne(
      { userId },
      {
        $set: {
          processType: "prepare_address",
        },
      }
    );
    return "Процесс отменён. Вы вернулись в процесс выбора способа указания адреса.";
  }
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
  return "Процесс отменён. Вы вернулись в главное меню.";
}
