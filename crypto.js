import crypto from "crypto";

const SECRET = "Satira228"; // Секретный ключ

export function encodeInvId(userId) {
  const randomNum = Math.floor(1000 + Math.random() * 9000); // 4-значное случайное число
  const rawId = `${userId}${randomNum}`; // Конкатенация userId и randomNum
  const checksum =
    rawId.split("").reduce((sum, digit) => sum + Number(digit), 0) % 10; // Контрольная сумма
  return Number(`${rawId}${checksum}`); // Возвращаем число с контрольной суммой
}

// Пример

export function decodeInvId(invId) {
  const invStr = invId.toString();
  const rawId = invStr.slice(0, -5); // Убираем последние 5 цифр (randomNum + checksum)
  return Number(rawId);
}
