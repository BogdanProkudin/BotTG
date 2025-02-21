export function generateCalendar(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const calendar = [];

  // Дни недели
  const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  calendar.push(
    weekDays.map((day) => ({ text: day, callback_data: "ignore" }))
  );

  let day = 1;
  for (let i = 0; i < 6; i++) {
    const week = [];
    for (let j = 0; j < 7; j++) {
      if (i === 0 && j < (firstDay === 0 ? 6 : firstDay - 1)) {
        week.push({ text: " ", callback_data: "ignore" });
      } else if (day > daysInMonth) {
        week.push({ text: " ", callback_data: "ignore" });
      } else {
        const date = new Date(year, month, day + 1);
        const isPast = date < new Date();
        week.push({
          text: isPast ? `❌${day}` : `${day}`,
          callback_data: isPast ? "ignore" : `date_${year}-${month + 1}-${day}`,
        });
        day++;
      }
    }
    calendar.push(week);
  }

  // Строка переключения месяцев с текущим месяцем и годом
  calendar.push([
    { text: "◀️", callback_data: `prev_${year}_${month}` },
    { text: `${getMonthName(month)} ${year}`, callback_data: "ignore" },
    { text: "▶️", callback_data: `next_${year}_${month}` },
  ]);

  return calendar;
}
export function getMonthName(month) {
  const months = [
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
  ];
  return months[month];
}
