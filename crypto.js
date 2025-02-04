import crypto from "crypto";

const SECRET = "Satira228"; // Секретный ключ

export function encodeInvId(userId) {
  const randomNum = Math.floor(Math.random() * 1000000); // Рандомное число
  const data = `${randomNum}:${userId}`;

  const hmac = crypto.createHmac("sha256", SECRET).update(data).digest("hex"); // Подписываем
  return Buffer.from(`${data}:${hmac}`).toString("base64");
}

// Пример

export function decodeInvId(encodedInvId) {
  const decoded = Buffer.from(encodedInvId, "base64").toString("utf8");
  const [randomNum, userId, hmac] = decoded.split(":");

  // Проверяем подпись
  const checkHmac = crypto
    .createHmac("sha256", SECRET)
    .update(`${randomNum}:${userId}`)
    .digest("hex");
  if (checkHmac !== hmac) throw new Error("⛔ Подпись неверна!");

  return userId;
}
