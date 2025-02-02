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

// Функция отмены процесса
export async function cancelProcess(userId, collectionUser) {
  const user = await collectionUser.findOne({ userId });
  if (
    (user && user.processType === "catalog_price=4000") ||
    user.processType === "catalog_price=8000" ||
    user.processType === "catalog_price=15000"
  ) {
    await collectionUser.updateOne(
      { userId },
      {
        $set: {
          processType: "catalog",
        },
      }
    );
    return "Вы вернулись в процесс выбора диапазона цен.";
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
  if (user && user.processType === "extra_information") {
    await collectionUser.updateOne(
      { userId },
      {
        $set: {
          processType: "recipient_number",
          recipientNumber: null,
        },
      }
    );
    return "Вы вернулись в процесс ввода номера получателя.";
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
