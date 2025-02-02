import express from "express";
import Robokassa from "robokassa";
import bodyParser from "body-parser";
import axios from "axios";

var app = express();
app.use(bodyParser.urlencoded({ extended: false }));

var r = new Robokassa({
  login: "floriadmin",
  password: "runovskiy8c1",

  test: true, // Укажите true для тестового режима
});

// Генерация ссылки на оплату
app.get("/generate-payment", (req, res) => {
  axios.get(
    "https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=floriadmin&OutSum=11&Description=Покупка в демо магазине&SignatureValue=d0465cede9d5189221e67e49e9890ec2"
  );
  res.send({ link: paymentLink });
});

// Обработка callback от Робокассы
app.post("/payment/callback", (req, res) => {
  const isPaymentValid = r.checkPayment(req.body);

  if (isPaymentValid) {
    console.log("Платеж подтверждён:", req.body);
    res.status(200).send("OK");
  } else {
    console.log("Ошибка проверки платежа:", req.body);
    res.status(400).send("Ошибка");
  }
});

// Запуск сервера
app.listen(3000, () => {
  console.log("Сервер запущен на http://localhost:3000");
});
