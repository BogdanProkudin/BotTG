export const getAvailableShippingTime = (user) => {
  const now = new Date();
  const morningHour = 9;
  const middayHour = 12;
  const lunchHour = 15;
  const eveningHour = 18;
  const lastHour = 20;
  const targetHour = now.getHours();

  const day = now
    .getDate()
    .toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const date = `${day}.${month}.${year}`;

  if (date !== user.selectedDate) {
    return [
      ["9-11", "12-14"],
      ["15-17", "18-20", "20-21"],
    ];
  }
  if (now.getHours() < morningHour) {
    return [
      ["9-11", "12-14"],
      ["15-17", "18-20", "20-21"],
    ];
  } else if (now.getHours() < middayHour) {
    return [
      ["12-14", "15-17"],
      ["18-20", "20-21"],
    ];
  } else if (now.getHours() < lunchHour) {
    return [["15-17", "18-20", "20-21"]];
  } else if (now.getHours() < eveningHour) {
    return [["18-20", "20-21"]];
  } else if (now.getHours() < lastHour) {
    return [["20-21"]];
  } else {
    return [["К сожалению, на этот день доставка недоступна."]];
  }
};
