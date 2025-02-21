import axios from "axios";

// Функция для автоматического форматирования адреса
function validateAddress(address) {
  // Регулярное выражение для проверки правильности формата адреса
  const regex = /^[А-Яа-яЁё\s]+,\s*[А-Яа-яЁё\s]+,\s*\d+[а-яА-ЯёЁ0-9\s]*$/;

  // Проверка, соответствует ли введённый адрес регулярному выражению
  if (regex.test(address)) {
    console.log("Адрес корректен");

    return address; // Адрес корректен
  } else {
    return {
      valid: false,
      message: address,
    };
  }
}
// Функция точного поиска по адресу
export default async function geocodeAddress(address) {
  // Форматируем адрес
  const BASE_URL = `https://geocode-maps.yandex.ru/1.x/?apikey=${"086f29d7-cda3-408e-b7b3-79aa43bb56c3"}&geocode=${address}&format=json
`;
  const formattedAddress = validateAddress(address);
  console.log(formattedAddress);

  console.log("Форматированный адрес:", formattedAddress); // Выводим форматированный адрес для проверки

  try {
    const response = await axios.get(BASE_URL, {});

    const result = response.data.response.GeoObjectCollection;
    console.log(result, "result");

    // Проверка на точное совпадение
    const isHouse =
      result.featureMember[0].GeoObject.metaDataProperty.GeocoderMetaData.kind;

    console.log(
      result.featureMember[0].GeoObject.metaDataProperty.GeocoderMetaData
    );

    if (
      isHouse === "house" &&
      result.featureMember[0].GeoObject.metaDataProperty.GeocoderMetaData.text.includes(
        "Москва"
      )
    ) {
      return {
        valid: true,
        message: "Адрес корректен.",
      };
    } else {
      return {
        valid: false,
        message:
          "К сожалению, мы не можем найти ваш адрес. Пожалуйста, убедитесь, что адрес находится в Москве и вы указываете точное местоположение.",
      };
    }
  } catch (error) {
    console.error("Ошибка при запросе к API:", error);
    return "Произошла ошибка при проверке адреса.";
  }
}
export async function getAddressFromCoordinates(lat, lon) {
  const BASE_URL = `https://geocode-maps.yandex.ru/1.x/?apikey=086f29d7-cda3-408e-b7b3-79aa43bb56c3&geocode=${
    lon + "," + lat
  }&format=json`;

  console.log(lat, lon);

  try {
    console.log("Отправка запроса..."); // Лог перед запросом
    const response = await axios.get(BASE_URL);

    console.log(
      response.data.response.GeoObjectCollection.featureMember[0].GeoObject
        .metaDataProperty.GeocoderMetaData
    );

    const isHouse =
      response.data.response.GeoObjectCollection.featureMember[0].GeoObject
        .metaDataProperty.GeocoderMetaData.kind;
    if (
      isHouse === "house" &&
      response.data.response.GeoObjectCollection.featureMember[0].GeoObject.metaDataProperty.GeocoderMetaData.text.includes(
        "Москва"
      )
    ) {
      return `${response.data.response.GeoObjectCollection.featureMember[0].GeoObject.metaDataProperty.GeocoderMetaData.text}`;
    } else {
      return "К сожалению, мы не можем найти ваш адрес. Пожалуйста, убедитесь, что адрес находится в Москве и вы указываете точное местоположение.";
    }
  } catch (error) {
    console.error("Ошибка при получении адреса:", error.message);
  }
}

// Пример вызова функции

// Пример вызова функции

// Пример использования
